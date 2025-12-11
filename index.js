const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.PORT || 3000;

// middleware
app.use(express.json());
app.use(cors());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.vtqh62q.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const db = client.db("Assignment-11");
    const issueCollection = db.collection("issues");

    //Issues
    app.get("/issues", async (req, res) => {
      const query = {};
      const { email } = req.query;
      if (email) {
        query.reporterEmail = email;
      }
      const cursor = issueCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.post("/issues", async (req, res) => {
      const issues = req.body;
      const result = await issueCollection.insertOne(issues);
      res.send(result);
    });

    app.patch("/issues/:id",async(req,res)=>{
      const id = req.params.id
      const issueInfo = req.body;

      const query = {_id : new ObjectId(id)}

      const updatedDOC = {
        $set: {
          title: issueInfo.title,
          description: issueInfo.description,
            category: issueInfo.category,
            image: issueInfo.image,
            location: issueInfo.location,
            date: issueInfo.date
        }
      }

      const result = await issueCollection.updateOne(query,updatedDOC)
      res.send(result)
    })

    app.delete("/issues/:id", async(req,res)=>{
        const id = req.params.id;
        const query = {_id: new ObjectId(id)}
        const result = await issueCollection.deleteOne(query)
        res.send(result)
    })

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
