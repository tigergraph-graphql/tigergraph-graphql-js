const { generateGraphSchema } = require('./index');
const cred = require('./config');
const express = require('express');
const { graphqlHTTP } = require('express-graphql');

// const conn = tigergraphConnection(cred.HOST, cred.GRAPH, cred.USERNAME, cred.PASSWORD, cred.SECRET, cred.TOKEN);
const schema = generateGraphSchema(cred.HOST, cred.GRAPH, cred.USERNAME, cred.PASSWORD, cred.SECRET, cred.TOKEN);

const app = express();

const generateSchema = async function () {
    await schema.generateSchema();
    // console.log(schema.getGraphQLSchema().getTypeMap());
    console.log(schema.getVerticesObjectsDict());


    /**
     * when query from TigerGraph installed query, 
     * user can get vertex type from schema's function getVerticesObjectsDict()
     */
    const typeDefs = `
     scalar JSON
     type edgeSet {
       e_type: String
       from_id: String
       from_type: String
       to_id: String
       to_type: String
       directed: Boolean
       attributes: JSON
     }
   
     type Query {
       discoverSocialConnections(A: String!, B: String!, k: Int, TGQueryResultName: String): [edgeSet]
     }
   `;

   let queryName = ['discoverSocialConnections'];
   schema.buildQuerySchema(typeDefs, queryName);

    app.use('/graphql', graphqlHTTP({
        schema: schema.getGraphQLSchema(),
        graphiql: true
    }));

    app.listen(4000, () => {
        console.log('Server is running on http://localhost:4000/graphql');
    });
}

generateSchema();
