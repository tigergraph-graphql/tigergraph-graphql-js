# TigerGraph-GraphQL QuickStart

### Features
- Auto generated schema for tgcloud Graph
- Implement getVertices, getEdges, deleleVertices, deleteEdges and upsert RESTAPI with auto generated shcema
- Able to build user-defined schema to fetch data from installed queries
- Auto created resolvers for running installed queries

### Usage
Connect to your tgcloud
```js
import { tgconn } from './index.js';

tgconn(HOST, GRPAH_NAME, USERNAME, PASSWORD, SECRET, TOKEN);
```

##### Auto generated schema:
```js
const {autoGeneratedSchema} = require('./index.js');
const generatedSchema = async() => {
    await autoGeneratedSchema();
}
```

##### To fetch data from installed queries, need to define a new GraphQL type:
```js
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
```
Sometimes, attributes from the installed query result contain specail character such as '@', '@@', we can use GraphQLJSON to represent all attributes. To use GraphQLJSON, claim ```js scalar JSON``` in type definition.

Note that query name defined in type definition should be same as your target installed query name. Parameters of each query you defined in type definition should contain the params of installed query, and also add a parameter named 'TGQueryResultName' which is the name that you printed as result in installed query. 

##### Build schema for installed queries:
Need to provide query names you defined in type definition as an array:
```js
let queryName = ['discoverSocialConnections'];
```
Then use 'buildInstalledQuerySchema' function:
```js
const { buildInstalledQuerySchema } = require('./index.js');
buildInstalledQuerySchema(typeDefs, queryName);
```

##### Create a local host server and run GraphiQL
```js
const express = require('express');
const { graphqlHTTP } = require('express-graphql');
app.use('/graphql', graphqlHTTP({
    schema: getGraphQLSchema(),
    graphiql: true
}));

app.listen(4000, () => {
    console.log('Server is running on http://localhost:4000/graphql');
});
```

To see the example code, please check './test.js' file.
