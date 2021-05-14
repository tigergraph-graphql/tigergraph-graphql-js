const tg = require('./tg_connection');
const cred = require('./config');
const { GraphQLBasicTypeMapper, customizeGraphQLList, customizeGraphQLMap } = require('./type_mapper');
const { GraphQLObjectType,
    GraphQLString,
    GraphQLSchema,
    GraphQLList,
    GraphQLInt,
} = require('graphql');


class TGSchema {
    constructor(host, graph_name, username, password, secret, token) {
        this.conn = new tg.TigerGraphConnection(host, graph_name, username, password, secret, token);
        this.verticesObjectsDict = {};
        this.edgesObjectsDict = {};
        this.graphQLSchema = undefined;
        this.udtType = {};
        this.rootQuery = undefined;
        this.vertexTypeInEdge = {};
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
            if (Object.keys(attType).length === 1) {
                fields[attName] = { type: GraphQLBasicTypeMapper(attType.Name) };
            }
            else if (Object.keys(attType).length == 2) {
                if (attType.name === 'UDT') {
                    fields[attName] = { type: this.udtType[attType.TupleName] };
                }
                else {
                    fields[attName] = { type: customizeGraphQLList(attType.ValueTypeName) };
                }
            }
            else if (Object.keys(attType).length == 3) {
                fields[attName] = { type: customizeGraphQLMap(attType.KeyTypeName, attType.ValueTypeName) };
            }
        });
        var attributeType = new GraphQLObjectType({
            name: objectName + "Attributes",
            fields: () => (fields),
        });
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
            // console.log(vertexName + ': fields: ');
            // console.log(fields);
            const graphQLObject = new GraphQLObjectType({
                name: vertexName,
                fields: () => (fields)
            });
            // console.log(graphQLObject);
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
            this.vertexTypeInEdge[edgeName] = {'from_id_type': this.verticesObjectsDict[fromVertexType], 'to_id_type': this.verticesObjectsDict[toVertexType]};
            fields['e_type'] = { type: GraphQLString };
            fields['directed'] = { type: GraphQLBasicTypeMapper('BOOL') };
            //!!! id type could not be GraphQLString
            fields['from_type'] = { type: GraphQLString };
            fields['from_id'] = { type: this.verticesObjectsDict[fromVertexType] };
            //!!! id type could not be GraphQLString
            fields['to_id'] = { type: this.verticesObjectsDict[toVertexType] };
            fields['to_type'] = { type: GraphQLString };
            if (edge.Attributes === undefined || edge.Attributes.length !== 0) {
                fields['attributes'] = { type: this.createAttributesType(edgeName, edge.Attributes) };
            }
            var edgeObject = new GraphQLObjectType({
                name: edgeName,
                fields: () => (fields)
            });
            // console.log(edgeObject);
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
                    // console.log(res.data.results);
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
            keyField1['args'] = { 'id': {type: GraphQLString} };
            // console.log(keyField1);
            // console.log(GraphQLString);
            keyField1['resolve'] = async (_, args) => {
                console.log(args.id);
                return await this.conn.getVertices(key, args.id).then(res => {
                    // console.log(res.data.results[0]);
                    return res.data.results[0];
                });
            };
            fields[key] = keyField1;
        }

        //edges query 
        for (const [key, value] of Object.entries(this.edgesObjectsDict)) {
            //fetch by source vertexType & vertexID
            let key1 = {};
            key1['type'] = new GraphQLList(value);
            key1['args'] = {
                'sourceVertexType': { type: GraphQLString },
                'sourceVertexId': { type: this.vertexTypeInEdge[key]['from_id_type'] }
            };
            key1['resolve'] = async (_, args) => {
                return await this.conn.getEdges(args.sourceVertexType, args.sourceVertexId, key)
                .then(res => {return res.data.results});
            };
            fields[key + 's'] = key1;

            //fetch by target vertexType and vertexID
            let key2 = {};
            key2['type'] = value;
            key2['args'] = {
                'sourceVertexType': { type: GraphQLString },
                'sourceVertexId': { type: this.vertexTypeInEdge[key]['from_id_type'] },
                'targetVertexType': { type : GraphQLString },
                'targetVertexId': { type: this.vertexTypeInEdge[key]['to_id_type'] }
            };
            key2['resolve'] = async(_, args) => {
                return await this.conn.getEdges(args.sourceVertexType, args.sourceVertexId, key, args.targetVertexType, args.targetVertexId)
                .then(res => {return res.data.results[0]});
            }
            fields[key] = key2;
        }

        // console.log(fields);
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
         * delete vertices
         */
        for (const [key, value] of Object.entries(this.verticesObjectsDict)) {
            //delete vertices
            let key1 = {};
            key1['type'] = value;
            key1['args'] = {
                filter: { type: GraphQLString },
                limit: { type: GraphQLInt }
            }
            key1['resolve'] = async (_, args) => {
                return this.conn.deleteVertices(key, undefined, args.filter, args.limit)
                .then(res => {res.data})
                .catch(err => console.log(err));
            }
            fields['delVertices' + key] = key1;

            //delete vertex by ids
        }
        const mutation = new GraphQLObjectType({
            name: 'mutation',
            fields: fields
        });
    }

    /**
     * generate schema for vertices and edges
     * @returns 
     */
    async generateSchema() {
        //should be throw an error
        if (this.conn === undefined) {
            console.log("tgconnection is null");
            return;
        }
        await this.conn.getSchema()
            .then(res => {
                let udts = res.data.results.UDTs;
                this.createUDTGraphQLObject(udts);
                let vertices = res.data.results.VertexTypes;
                let edges = res.data.results.EdgeTypes;
                this.generateVertexObjects(vertices);
                this.generateEdgeObjects(edges);
            });
        if (this.rootQuery === undefined) {
            this.generateRootQuery();
        }
        if (this.graphQLSchema === undefined) {
            this.graphQLSchema = new GraphQLSchema({
                query: this.rootQuery
            });
        }
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