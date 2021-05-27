const tg = require('./tg_connection');
const { GraphQLBasicTypeMapper, customizeGraphQLList, customizeGraphQLMap } = require('./type_mapper');
const { GraphQLObjectType,
    GraphQLString,
    GraphQLSchema,
    GraphQLList,
    GraphQLInt,
    GraphQLNonNull,
} = require('graphql');
const { GraphQLJSON } = require('graphql-scalars');
const { makeExecutableSchema } = require('graphql-tools');
const { stitchSchemas } = require('graphql-tools');


class TGSchema {
    constructor(host, graph_name, username, password, secret, token) {
        this.conn = new tg.TigerGraphConnection(host, graph_name, username, password, secret, token);
        //vertices object dictinary: {key: vertex name, value: vertex graphql object}
        this.verticesObjectsDict = {};
        //edges object dictionary: {key: edges name, value: edges graphql object}
        this.edgesObjectsDict = {};
        //store sub schema including auto-generated and 
        this.TGSubSchema = [];
        this.graphQLSchema = undefined;
        //store tg user define type 
        this.udtType = {};
        this.rootQuery = undefined;
        this.mutation = undefined;
        //store edge's source vertex id type and target vertex id type: {key: edgeName, value: {{from_id_type: type}, {to_id_type: type}}}
        this.vertexTypeInEdge = {};
        //attributesObjectDict: {key: vertex/edge name, value: attributes object}
        this.attributesObjectDict = {};
    }

    /**
     * create attributes graphql object for tg vertex and edge
     * @param {*} attributes 
     * @param {*} idName 
     * @param {*} idField 
     * @returns 
     */
    createAttributesType(objectName, attributes, idName = undefined, idField = undefined) {
        let fields = {};
        if (idField !== undefined && idName !== undefined) {
            fields[idName] = idField;
        }
        attributes.map(att => {
            let attName = att.AttributeName;
            let attType = att.AttributeType;
            //attributes with basic type
            if (Object.keys(attType).length === 1) {
                fields[attName] = { type: GraphQLBasicTypeMapper(attType.Name) };
            }
            //attributes with List, Set, or UDT
            else if (Object.keys(attType).length == 2) {
                if (attType.name === 'UDT') {
                    fields[attName] = { type: this.udtType[attType.TupleName] };
                }
                else {
                    fields[attName] = { type: customizeGraphQLList(attType.ValueTypeName) };
                }
            }
            //attributes with Map
            else if (Object.keys(attType).length == 3) {
                fields[attName] = { type: customizeGraphQLMap(attType.KeyTypeName, attType.ValueTypeName) };
            }
        });
        var attributeType = new GraphQLObjectType({
            name: objectName + "Attributes",
            fields: () => (fields),
        });
        this.attributesObjectDict[objectName] = attributeType;
        return attributeType;
    }

    /**
     * parse json into graphql vertex objects, store in verticesSchemaDict 
     * @param {*} vertices 
     */
    generateVertexObjects(vertices) {
        vertices.map(vertex => {
            let vertexName = vertex.Name;
            let id = vertex.PrimaryId;
            let attributes = vertex.Attributes;
            // this.createGraphQLObject(this.verticesSchemaDict, vertexName, id, attributes);
            let fields = {};
            fields['v_id'] = { type: GraphQLBasicTypeMapper(id.AttributeType.Name) };
            fields['v_type'] = { type: GraphQLString };
            //if vertex id as a attribute
            if (id.PrimaryIdAsAttribute) {
                fields['attributes'] = { type: this.createAttributesType(vertexName, attributes, id.AttributeName, fields['v_id']) };
            }
            else {
                if (attributes.length !== 0) {
                    fields['attributes'] = { type: this.createAttributesType(vertexName, attributes) };
                }
            }
            const graphQLObject = new GraphQLObjectType({
                name: vertexName,
                fields: () => (fields)
            });
            this.verticesObjectsDict[vertexName] = graphQLObject;
        });
    }

    /**
     * parse edges json into edge graphql object
     * @param {} edges 
     */
    generateEdgeObjects(edges) {
        edges.map(edge => {
            let fields = {};
            let edgeName = edge.Name;
            let fromVertexType = edge.ToVertexTypeName;
            let toVertexType = edge.FromVertexTypeName;
            this.vertexTypeInEdge[edgeName] = { 'from_id_type': this.verticesObjectsDict[fromVertexType].getFields()['v_id']['type'], 'to_id_type': this.verticesObjectsDict[toVertexType].getFields()['v_id']['type'] };
            fields['e_type'] = { type: GraphQLString };
            fields['directed'] = { type: GraphQLBasicTypeMapper('BOOL') };
            fields['from_type'] = { type: GraphQLString };
            fields['from_id'] = { type: this.verticesObjectsDict[fromVertexType].getFields()['v_id']['type'] };
            fields['to_id'] = { type: this.verticesObjectsDict[toVertexType].getFields()['v_id']['type'] };
            fields['to_type'] = { type: GraphQLString };
            if (edge.Attributes === undefined || edge.Attributes.length !== 0) {
                fields['attributes'] = { type: this.createAttributesType(edgeName, edge.Attributes) };
            }
            var edgeObject = new GraphQLObjectType({
                name: edgeName,
                fields: () => (fields)
            });
            this.edgesObjectsDict[edgeName] = edgeObject;
        });
    }

    /**
     * generate rootQuery object for getVertices and getEdges
     * @returns 
     */
    async generateRootQuery() {
        // const resolveFun = (parentValue, args) => {
        //     return this.conn.getVertices(args.vertexName).then(res => res.data);
        // }
        let fields = {};
        //iterate vertices dictinary to create rootQuery vertices fields 
        for (const [key, value] of Object.entries(this.verticesObjectsDict)) {
            let keyField = {};
            keyField['type'] = new GraphQLList(value);
            keyField['resolve'] = async () => {
                return await this.conn.getVertices(key).then(res => {
                    return res.data.results;
                });
            };
            fields[key + 's'] = keyField;

            /**
             * fetch vertex by id
             */
            let keyField1 = {};
            keyField1['type'] = value;
            //id should be retreived type 
            keyField1['args'] = { 'id': { type: GraphQLNonNull(GraphQLString) } };
            keyField1['resolve'] = async (_, args) => {
                return await this.conn.getVertices(key, args.id).then(res => {
                    return res.data.results[0];
                });
            };
            fields[key] = keyField1;
        }

        //edges query 
        for (const [key, value] of Object.entries(this.edgesObjectsDict)) {

            //fetch by target vertexType and vertexID
            let key2 = {};
            key2['type'] = new GraphQLList(value);
            key2['args'] = {
                'sourceVertexType': { type: GraphQLNonNull(GraphQLString) },
                'sourceVertexId': { type: GraphQLNonNull(this.vertexTypeInEdge[key]['from_id_type']) },
                'targetVertexType': { type: GraphQLString },
                'targetVertexId': { type: this.vertexTypeInEdge[key]['to_id_type'] }
            };
            key2['resolve'] = async (_, args) => {
                return await this.conn.getEdges(args.sourceVertexType, args.sourceVertexId, key, args.targetVertexType, args.targetVertexId)
                    .then(res => { return res.data.results });
            }
            fields[key] = key2;
        }

        this.rootQuery = new GraphQLObjectType({
            name: 'rootQuery',
            fields: fields
        });
    }

    /**
     * create udt graphql object
     * @param {udt json} udts 
     * @returns 
     */
    createUDTGraphQLObject(udts) {
        if (udts === undefined) {
            return;
        }
        //iterate udts json
        udts.map(udt => {
            let fields = {};
            //iterate udt attributes and add these into dictionary fields
            udt.fields.map(field => {
                fields[field.fieldName] = { type: GraphQLBasicTypeMapper(field.fieldType) };
            });
            //create udt graphql object
            const udtObject = new GraphQLObjectType({
                name: udt.name,
                fields: fields
            });
            //add created udt object into dictionary udtType
            this.udtType[udt.name] = udtObject;
        });
    }

    createMutation() {
        let fields = {};
        /**
         * iterate vertices
         */
        const delVertexResult = new GraphQLObjectType({
            name: 'delVertexResult',
            fields: () => ({
                v_type: {type: GraphQLString},
                deleted_vertices: {type: GraphQLInt}
            })
        });
        for (const [key, value] of Object.entries(this.verticesObjectsDict)) {
            //delete vertices
            let key1 = {};
            key1['type'] = delVertexResult;
            key1['args'] = {
                filter: { type: GraphQLString },
                limit: { type: GraphQLInt },
                sort: { type: GraphQLString }
            }
            key1['resolve'] = async (_, args) => {
                return this.conn.deleteVertices(key, undefined, args.filter, args.limit, args.sort)
                    .then(res => { 
                        if (res.data.error) {
                            throw new Error(res.data.message);
                        }
                        console.log(res.data); 
                        return res.data.results; 
                    }).catch(err => {
                        console.log(err);
                        throw new Error('Fail to delete vertices');
                    });
            }
            fields['del' + key + 's'] = key1;

            //delete vertex by id
            let key2 = {};
            key2['type'] = delVertexResult;
            key2['args'] = {
                vertexId: { type: GraphQLNonNull(value.getFields()['v_id']['type']) },
            }
            key2['resolve'] = async (_, args) => {
                return this.conn.deleteVertices(key, args.vertexId)
                    .then(res => {
                        if (res.data.error) {
                            throw new Error(res.data.message);
                        }
                        return res.data.results;
                    })
                    .catch(err => {
                        console.log(err.message);
                        throw new Error('Fail to delete vertex by id');
                    });
            }
            fields['del' + key + 'ById'] = key2;

            //upsert vertex
            /**
             * how to deal with upsert with [LIST, SET, MAP] data
             * got error when upsert the vertex which contains [MAP] attribute
             */
            let key3 = {};
            key3['type'] = value;
            key3['args'] = {
                vertexId: { type: value.getFields()['v_id'].type },
            };
            let attributes = this.attributesObjectDict[key];
            if (attributes !== undefined) {
                let att = attributes.getFields();
                for (const [key, value] of Object.entries(att)) {
                    key3['args'][key] = { type: value.type };
                }
            }
            key3['resolve'] = (_, args) => {
                let att = {};
                if (attributes !== undefined) {
                    for (const [key, value] of Object.entries(attributes.getFields())) {
                        att[key] = { 'value': args[key] };
                    }
                }
                let json = {};
                json['vertices'] = {};
                json['vertices'][key] = {};
                json['vertices'][key][args.vertexId] = att;
                return this.conn.upsertData(JSON.stringify(json))
                    .then(res => { return res.data; })
                    .catch(err => {
                        console.log(err.message);
                        throw new Error('Fail to upsert vertex');
                    })
            }
            fields['upsertVertex' + key] = key3;
        }

        const delEdgeResult = new GraphQLObjectType({
            name: 'delEdgeResult',
            fields: () => ({
                e_type: { type: GraphQLString },
                deleted_edges: { type: GraphQLInt }
            })
        });
        /**
         * iterate edges
         */
        for (const [key, value] of Object.entries(this.edgesObjectsDict)) {
            //delete all qualified edges by sourceVertex&id
            let key1 = {};
            key1['type'] = new GraphQLList(delEdgeResult);
            key1['args'] = {
                sourceVertexType: { type: GraphQLNonNull(GraphQLString) },
                sourceVertexId: { type: GraphQLNonNull(this.vertexTypeInEdge[key]['from_id_type']) },
                targetVertexType: { type: GraphQLString },
                targetVertexId: { type: this.vertexTypeInEdge[key]['to_id_type'] },
            }
            key1['resolve'] = (_, args) => {
                return this.conn.deleteEdges(args.sourceVertexType, args.sourceVertexId, key, args.targetVertexType, args.targetVertexId)
                    .then(res => {
                        if (res.data.error) {
                            throw new Error(res.data.message);
                        }
                        return res.data.results;
                    })
                    .catch(err => {
                        console.log(err.message);
                        throw new Error('fail to delete edges by source vertex and its id');
                    });
            }
            fields['delEdges' + key] = key1;

            //upsert edge into graph
            /**
             * how to deal with upsert with [LIST, SET, MAP] data
             * got error when upsert the vertex which contains [MAP] attribute
             */
            let key3 = {};
            key3['type'] = value;
            key3['args'] = [];
            key3['args'] = {
                sourceVertexType: { type: GraphQLString },
                sourceVertexId: { type: this.vertexTypeInEdge[key]['from_id_type'] },
                targetVertexType: { type: GraphQLString },
                targetVertexId: { type: this.vertexTypeInEdge[key]['to_id_type'] }
            };
            let attributes = this.attributesObjectDict[key];
            if (attributes !== undefined) {
                let att = attributes.getFields();
                for (const [key, value] of Object.entries(att)) {
                    key3['args'][key] = { type: value.type };
                }
            }
            key3['resolve'] = (_, args) => {
                let att = {};
                if (attributes !== undefined) {
                    for (const [key] of Object.keys(attributes.getFields())) {
                        att[key] = args[key];
                    }
                }
                let json = {};
                json['edges'] = {};
                json['edges'][args.sourceVertexType] = {};
                json['edges'][args.sourceVertexType][args.sourceVertexId] = {};
                json['edges'][args.sourceVertexType][args.sourceVertexId][key] = {};
                json['edges'][args.sourceVertexType][args.sourceVertexId][key][args.targetVertexType] = {};
                json['edges'][args.sourceVertexType][args.sourceVertexId][key][args.targetVertexType][args.targetVertexId] = att;
                return this.conn.upsertData(JSON.stringify(json))
                    .then(res => { return res.data })
                    .catch(err => {
                        console.log(err.message);
                        throw new Error('Fail to upsert edges');
                    })
            }
            fields['upsertEdges' + key] = key3;
        }

        const mutation = new GraphQLObjectType({
            name: 'mutation',
            fields: fields
        });

        return mutation;
    }

    buildResolvers(queryName) {
        const resolvers = { JSON: GraphQLJSON };
        const query = {};
        if (queryName === undefined) {
            throw new Error('Please provide graphql query name');
        }
        queryName.map(name => {
            query[name] = async (_, args) => {
                let TGQueryResultName = undefined;
                if (args.hasOwnProperty('TGQueryResultName')) {
                    TGQueryResultName = args.TGQueryResultName;
                    delete args['TGQueryResultName'];
                }
                return await this.conn.runInstalledQuery(name, args)
                    .then(res => {
                        let result = res.data.results[0][TGQueryResultName];
                        if (result === undefined) {
                            throw new Error('Provide wrong query result name on tgcloud');
                        }
                        return result;
                    }).catch(err => {
                        throw new Error('Fail to run installed query.' + err.message);
                    });
            }
        });
        resolvers['Query'] = query;
        return resolvers;
    }

    /**
     * params are the dictinary of target gsql query parameters
     * @param {*} typeDefs 
     * @param {*} queryName as array
     */
    buildInstalledQuerySchema(typeDefs, queryName) {
        if (this.conn === undefined) {
            console.log("tgconnection is null");
            throw new Error("TigerGraph connection is not established!");
        }
        let resolvers = this.buildResolvers(queryName);
        const subschema = makeExecutableSchema({
            typeDefs,
            resolvers
        });
        this.TGSubSchema.push(subschema);
        this.graphQLSchema = stitchSchemas({
            subschemas: this.TGSubSchema
        });
    }

    /**
     * generate schema for vertices and edges
     * @returns 
     */
    async autoGeneratedSchema() {
        if (this.conn === undefined) {
            console.log("tgconnection is null");
            throw new Error("TigerGraph connection is not established!");
        }
        await this.conn.getSchema()
            .then(res => {
                //get udt type objects
                let udts = res.data.results.UDTs;
                this.createUDTGraphQLObject(udts);

                let vertices = res.data.results.VertexTypes;
                let edges = res.data.results.EdgeTypes;
                //generate vertex objects
                this.generateVertexObjects(vertices);
                //generate edge objectd
                this.generateEdgeObjects(edges);
            }).catch(err => {
                console.log(err.message);
                throw new Error('Fail to get Graph Schema from tgcloud.');
            });
        if (this.rootQuery === undefined) {
            this.generateRootQuery();
        }
        if (this.mutation === undefined) {
            this.mutation = this.createMutation();
        }
        const subschema = new GraphQLSchema({
            query: this.rootQuery,
            mutation: this.mutation
        });
        this.TGSubSchema.push(subschema);
        this.graphQLSchema = stitchSchemas({
            subschemas: this.TGSubSchema
        });
    }

    getVerticesObjectsDict() {
        return this.verticesObjectsDict;
    }

    getEdgesObjectsList() {
        return this.edgesObjectsDict;
    }

    getRootQuery() {
        return this.rootQuery;
    }

    getGraphQLSchema() {
        return this.graphQLSchema;
    }
}

exports.TGSchema = TGSchema;