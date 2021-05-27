const schema = require('./tg_schema');

let tgschema = undefined;

const tgconn = (host, graph_name, username, password, secret, token) => {
    tgschema = new schema.TGSchema(host, graph_name, username, password, secret, token);
}

const buildInstalledQuerySchema = async(typeDefs, queryName) => {
    if (tgschema === undefined) {
        throw new Error('Please build a TigerGraph connection First');
    }
    await tgschema.buildInstalledQuerySchema(typeDefs, queryName);
}

const autoGeneratedSchema = async() => {
    if (tgschema === undefined) {
        throw new Error('Please build a TigerGraph connection First');
    }
    await tgschema.autoGeneratedSchema();
}

const getGraphQLSchema = () => {
    return tgschema.getGraphQLSchema();
}

module.exports = {
    tgconn,
    buildInstalledQuerySchema,
    autoGeneratedSchema,
    getGraphQLSchema
}

