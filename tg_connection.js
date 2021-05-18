const axios = require('axios');
const base64 = require('base-64');

class TigerGraphConnection {
    constructor(host = "localhost", graph_name = "MyGraph", username = "tigergraph", password = "tigergraph", secret = undefined, token = undefined) {
        this.HOST = "https://" + host;
        this.RESTPORT = "9000";
        this.GSPORT = "14240";
        this.GRAPH_NAME = graph_name;
        this.USERNAME = username;
        this.PASSWORD = password;
        this.SECRET = secret;
        this.TOKEN = token;
        this.GSURL = this.HOST + ":" + this.GSPORT;
        this.RESTURL = this.HOST + ":" + this.RESTPORT;
        this.HEADERS = { 'Authorization': `Bearer ${this.TOKEN}` }
    }

    getToken() {
        return axios.get(this.RESTURL + '/requesttoken?secret=' + this.secret)
        .then(res => {return res.data.token})
        .catch(err => {
            console.log(err.message);
            throw new Error(err.message);
        });
    }

    getSchema() {
        return axios.get(this.GSURL + "/gsqlserver/gsql/schema?graph=" + this.GRAPH_NAME, {
            headers: {
                'Authorization': `Bearer ${this.TOKEN}`
            },
            auth: {
                username: this.USERNAME,
                password: this.PASSWORD
            }
        });
        //.then(res => console.log(res.data))
        //.catch(err => console.log(err));
    }

    getVertices(vertexName, vertexId = undefined) {
        if (vertexId !== undefined) {
            return axios.get(this.RESTURL + '/graph/' + this.GRAPH_NAME + '/vertices/' + vertexName + '/' + vertexId, {
                headers: this.HEADERS
            });
        }
        else {
            return axios.get(this.RESTURL + '/graph/' + this.GRAPH_NAME + '/vertices/' + vertexName + '?limit=100', {
                headers: this.HEADERS
            });
        }
    }

    getEdges(sourceVertexType = undefined, sourceVertexId = undefined, edgeType = undefined, targetVertexType = undefined, targetVertexId = undefined) {
        if (sourceVertexType === undefined || sourceVertexId === undefined) {
            throw new Error('Both source vertex type and source vertex ID must be provided.');
        }
        let url = this.RESTURL + '/graph/' + this.GRAPH_NAME + '/edges/' + sourceVertexType + '/' + sourceVertexId;
        if (edgeType !== undefined) {
            url += '/' + edgeType;
            if (targetVertexType !== undefined) {
                url += '/' + targetVertexType;
                if (targetVertexId !== undefined) {
                    url += '/' + targetVertexId;
                }
            }
        }
        return axios.get(url, {
            headers: this.HEADERS
        });
    }

    deleteVertices(vertexType, vertexId = undefined, where  = undefined, limit  = undefined) {
        if (vertexType === undefined) {
            throw new Error('Vertex type must be provided to delete vertices.');
        }
        let url = this.RESTURL + '/graph/' + this.GRAPH_NAME + '/vertices/' + vertexType;
        if (vertexId) {
            url += '/' + vertexId;
        }
        console.log(url);
        return axios.delete(url, {
            headers: this.HEADERS
        });
    }

    deleteEdges(sourceVertexType, sourceVertexId, edgeType = undefined, targetVertexType = undefined, targetVertexId = undefined, limit = undefined) {
        if (sourceVertexId === undefined && sourceVertexType === undefined) {
            throw new Error('Both source vertex type and source vertex ID must be provided.');
        }
        let url = this.RESTURL + '/graph/' + this.GRAPH_NAME + '/edges/' + sourceVertexType + '/' + sourceVertexId;
        if (edgeType) {
            url += '/' + edgeType;
            if (targetVertexType) {
                url += '/' + targetVertexType;
                if (targetVertexId) {
                    url += '/' + targetVertexId;
                }
            }
        }
        if (limit) {
            url += '?limit=' + limit;
        }
        return axios.delete(url, {
            headers: this.HEADERS
        });
    }

    upsertData(data) {
        return axios.post(this.RESTURL + '/graph/' + this.GRAPH_NAME, data, {
            headers: this.HEADERS
        });
    }
}

exports.TigerGraphConnection = TigerGraphConnection;