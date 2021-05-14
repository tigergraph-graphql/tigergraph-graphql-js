const tg = require('./tg_connection');
const schema = require('./tg_schema');


const generateGraphSchema = (host, graph_name, username, password, secret, token) => {
    return new schema.TGSchema(host, graph_name, username, password, secret, token);
}

module.exports = {
    generateGraphSchema
}

