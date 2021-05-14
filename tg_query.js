const {
    GraphQLObjectType,
    GraphQLString,
    GraphQLInt,
    GraphQLSchema,
    GraphQLList,
    GraphQLNonNull
} = require('graphql');
const tgSchema = require('./tg_schema');
const tgConnection = require('./tg_connection');

class TGQuery {
    constructor(conn, schema) {
        this.conn = conn;
        this.schema = schema;
    }
}

const query = new GraphQLObjectType({
    name: "VerticesQuery",
    fields: {
    }
})