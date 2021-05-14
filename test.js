const { generateGraphSchema } = require('./index');
const cred = require('./config');
const express = require('express');
const { graphqlHTTP } = require('express-graphql');

// const conn = tigergraphConnection(cred.HOST, cred.GRAPH, cred.USERNAME, cred.PASSWORD, cred.SECRET, cred.TOKEN);
const schema = generateGraphSchema(cred.HOST, cred.GRAPH, cred.USERNAME, cred.PASSWORD, cred.SECRET, cred.TOKEN);

const app = express();

const getVertices = (obj, args, context, info) => { 
    const id = obj.id;
    console.log(id);
    // console.log(obj); // debug
    // console.log(args); // debug

    // return schema.find(course => {
    //     return course.id === id;
    // });

    return "Hello";
};

const generateSchema = async function () {
    await schema.generateSchema();
    // console.log(schema.getGraphQLSchema().getTypeMap());
    app.use('/graphql', graphqlHTTP({
        schema: schema.getGraphQLSchema(),
        // context: {},
        // // rootValue: { vertex: getVertices },
        graphiql: true
    }));

    app.listen(4000, () => {
        console.log('Server is running');
    });
}

generateSchema();
