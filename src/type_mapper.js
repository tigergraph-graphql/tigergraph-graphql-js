const {
    GraphQLString,
    GraphQLInt,
    GraphQLFloat,
    GraphQLBoolean,
    GraphQLList,
    GraphQLObjectType,
} = require('graphql');
 
const GraphQLBasicTypeMapper = t => {
    const map = {
        'INT': GraphQLInt,
        'UINT': GraphQLInt,
        'FLOAT': GraphQLFloat,
        'DOUBLE': GraphQLFloat,
        'STRING': GraphQLString,
        'STRING COMPRESS': GraphQLString,
        'BOOL': GraphQLBoolean,
        'DATETIME': GraphQLString,
    };
    return map[t];
}

/**
 * TigerGraph List & Set type responses to GraphQLList
 * @param {*} valueType 
 */
const customizeGraphQLList = (valueType = undefined) => {
    if (valueType === undefined) {
        throw new Error("Value type is not defined when creating GraphQLList");
    }
    return new GraphQLList(GraphQLBasicTypeMapper(valueType));
}

/**
 * build for TigerGraph Map type
 * @param {*} keyType 
 * @param {*} valueType 
 * @returns 
 */
const customizeGraphQLMap = (keyType = undefined, valueType = undefined) => {
    if (keyType === undefined || valueType === undefined) {
        throw new Error('Value type or key type is not defined when creating GraphQLMap');
    }
    const GraphQLMap = new GraphQLObjectType({
        name: 'GraphQLMap',
        fields: () => ({
            key: { type: GraphQLBasicTypeMapper(keyType) },
            value: { type: GraphQLBasicTypeMapper(valueType)}
        })
    });
    return GraphQLMap;
}

/**
 * 
 * @param {type mapper} t 
 * @returns 
 */
const TypeMapper = t => {
    const mapping = {
        'INT': 'number',
        'UNIT': 'number',
        'FLOAT': 'number',
        'DOUBLE': 'number',
        'STRING': 'string',
        'STRING COMPRESS': 'string',
        'BOOL': 'boolean',
        'DATETIME': 'Data'
    };
    return map[t];
}

module.exports = {
    GraphQLBasicTypeMapper,
    customizeGraphQLList,
    customizeGraphQLMap
};