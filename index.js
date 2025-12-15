const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET);
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
    const usersCollection = db.collection("users");
    const staffCollection = db.collection("staffs");
    const paymentCollection = db.collection("payments");

    //users
    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      let result = await usersCollection.findOne(query);
      if (!result) {
        result = await staffCollection.findOne(query);
      }
      res.send(result);
    });

    app.get("/users", async (req, res) => {
      const cursor = usersCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/users/:email/role", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      let result = await usersCollection.findOne(query);
      if (!result) {
        result = await staffCollection.findOne(query);
      }
      res.send(result);
    });

    app.patch("/users/:id/role", async (req, res) => {
      const id = req.params.id;
      const roleInfo = req.body;
      const query = { _id: new ObjectId(id) };
      const updatedDOC = {
        $set: {
          role: roleInfo.role,
        },
      };
      const result = await usersCollection.updateOne(query, updatedDOC);
      res.send(result);
    });

    app.patch("/users/:id/status", async (req, res) => {
      const id = req.params.id;
      const statusInfo = req.body;
      const query = { _id: new ObjectId(id) };
      const updatedDOC = {
        $set: {
          status: statusInfo.status,
        },
      };
      const result = await usersCollection.updateOne(query, updatedDOC);
      res.send(result);
    });

    app.patch("/users/subscribe/:email", async (req, res) => {
      const email = req.params.email;
      const query = email;
      const updatedDOC = {
        $set: {
          role: "Premium",
        },
      };
      const result = await usersCollection.updateOne(query, updatedDOC);
      res.send(result);
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      user.role = "user";
      user.createdAt = new Date();
      user.status = "Regular";
      const email = user.email;
      const userExists = await usersCollection.findOne({ email });

      if (userExists) {
        return res.send({ message: "user exists" });
      }

      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    //staffs
    app.get("/staffs", async (req, res) => {
      const cursor = staffCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.patch("/staffs/:id", async (req, res) => {
      const id = req.params.id;
      const staffInfo = req.body;
      const query = { _id: new ObjectId(id) };

      const updatedDOC = {
        $set: {
          email: staffInfo.email,
          contact: staffInfo.contact,
          displayName: staffInfo.displayName,
          photoURL: staffInfo.photoURL,
        },
      };

      const result = await staffCollection.updateOne(query, updatedDOC);
      res.send(result);
    });

    app.post("/staffs", async (req, res) => {
      const staff = req.body;
      (staff.status = "Available"), (staff.createdAt = new Date());

      const result = await staffCollection.insertOne(staff);
      res.send(result);
    });

    app.delete("/staffs/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await staffCollection.deleteOne(query);
      res.send(result);
    });

    //Stripe Payment
    app.post("/create-checkout-session", async (req, res) => {});

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

    app.get("/issue", async (req, res) => {
      const cursor = issueCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/issues/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await issueCollection.findOne(query);
      res.send(result);
    });

    app.post("/issues", async (req, res) => {
      const issues = req.body;
      const result = await issueCollection.insertOne(issues);
      res.send(result);
    });

    app.patch("/issues/:id", async (req, res) => {
      const id = req.params.id;
      const issueInfo = req.body;

      const query = { _id: new ObjectId(id) };

      const updatedDOC = {
        $set: {
          title: issueInfo.title,
          description: issueInfo.description,
          category: issueInfo.category,
          image: issueInfo.image,
          location: issueInfo.location,
          date: issueInfo.date,
        },
      };

      const result = await issueCollection.updateOne(query, updatedDOC);
      res.send(result);
    });

    app.patch("/issues/:id/assign", async (req, res) => {
      const id = req.params.id;
      const { staffId, staffEmail, staffName, trackingId } = req.body;
      const query = { _id: new ObjectId(id) };

      const updatedDOC = {
        $set: {
          IssueStatus: "In Progress",
          staffId: staffId,
          staffEmail: staffEmail,
          staffName: staffName,
        },
      };

      const result = await issueCollection.updateOne(query, updatedDOC);
      res.send(result);
    });

    app.delete("/issues/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await issueCollection.deleteOne(query);
      res.send(result);
    });

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
