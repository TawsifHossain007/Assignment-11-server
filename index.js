const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET);
const port = process.env.PORT || 3000;

const admin = require("firebase-admin");

const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
  "utf8"
);
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

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
    // await client.connect();

    const db = client.db("Assignment-11");
    const issueCollection = db.collection("issues");
    const usersCollection = db.collection("users");
    const staffCollection = db.collection("staffs");
    const paymentCollection = db.collection("payments");

    const verifyFBToken = async (req, res, next) => {
      const token = req.headers.authorization;
      if (!token) {
        return res.status(401).send({ message: "Unauthorized" });
      }

      try {
        const idToken = token.split(" ")[1];
        const decodedToken = await admin.auth().verifyIdToken(idToken);

        req.decodedEmail = decodedToken.email;
        next();
      } catch (err) {
        return res.status(401).send({ message: "Unauthorized" });
      }
    };

    const verifyAdmin = async (req, res, next) => {
      const email = req.decodedEmail;
      const query = { email };
      const user = await usersCollection.findOne(query);

      if (!user || user.role !== "admin") {
        return res.status(403).send({ message: "forbidden access" });
      }

      next();
    };

    const verifyStaff = async (req, res, next) => {
      const email = req.decodedEmail;
      const query = { email };
      const user = await staffCollection.findOne(query);

      if (!user || user.role !== "staff") {
        return res.status(403).send({ message: "forbidden access" });
      }

      next();
    };

    //users
    app.get("/users/:email", verifyFBToken, async (req, res) => {
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

    app.get("/users/:email/role", verifyFBToken, async (req, res) => {
      const email = req.params.email;
      const query = { email };

      let result = await usersCollection.findOne(query);
      if (!result) {
        result = await staffCollection.findOne(query);
      }
      res.send(result);
    });

    app.patch("/users/:id", verifyFBToken, async (req, res) => {
      const id = req.params.id;
      const UserInfo = req.body;
      const query = { _id: new ObjectId(id) };

      const updatedDOC = {
        $set: {
          displayName: UserInfo.displayName,
          photoURL: UserInfo.photoURL,
        },
      };

      const result = await usersCollection.updateOne(query, updatedDOC);
      res.send(result);
    });

    app.patch("/users/:id/role",verifyFBToken,verifyAdmin,async (req, res) => {
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
      }
    );

    app.patch("/users/:id/status", verifyFBToken, async (req, res) => {
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

    app.patch("/users/subscribe/:email", verifyFBToken, async (req, res) => {
      const email = req.params.email;
      const query = { email };
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
    app.get("/staffs", verifyFBToken, verifyAdmin, async (req, res) => {
      const cursor = staffCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.patch("/staffs/:id", verifyFBToken, async (req, res) => {
      const id = req.params.id;
      const staffInfo = req.body;
      const query = { _id: new ObjectId(id) };

      const updatedDOC = {
        $set: {
          contact: staffInfo.contact,
          displayName: staffInfo.displayName,
          photoURL: staffInfo.photoURL,
        },
      };

      const result = await staffCollection.updateOne(query, updatedDOC);
      res.send(result);
    });

    app.post("/staffs", verifyFBToken, verifyAdmin, async (req, res) => {
      const staff = req.body;
      (staff.status = "Available"), (staff.createdAt = new Date());

      const result = await staffCollection.insertOne(staff);
      res.send(result);
    });

    app.delete("/staffs/:id", verifyFBToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await staffCollection.deleteOne(query);
      res.send(result);
    });

    //Stripe Payment
    app.post("/create-checkout-session", verifyFBToken, async (req, res) => {
      const paymentInfo = req.body;
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            // Provide the exact Price ID (for example, price_1234) of the product you want to sell
            price_data: {
              currency: "bdt",
              product_data: {
                name: paymentInfo.subscriptionType + " Subscription",
              },
              unit_amount: parseInt(paymentInfo.amount * 100), // amount in cents
            },

            quantity: 1,
          },
        ],
        customer_email: paymentInfo.reporterEmail,
        mode: "payment",
        metadata: {
          reporterName: paymentInfo.reporterName,
          reporterEmail: paymentInfo.reporterEmail,
          subscriptionType: paymentInfo.subscriptionType,
        },
        success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancel`,
      });
      res.send({ url: session.url });
    });

    app.patch("/payment-success", verifyFBToken, async (req, res) => {
      const session_id = req.query.session_id;
      const session = await stripe.checkout.sessions.retrieve(session_id);

      const transactionId = session.payment_intent;

      const query = { transactionId: transactionId };
      const existingPayment = await paymentCollection.findOne(query);
      if (existingPayment) {
        return res.send({
          success: true,
          transactionId,
          message: "Payment already processed.",
        });
      }

      if (session.payment_status === "paid") {
        const email = session.metadata.reporterEmail;

        const query = { email: email };

        const updatedDOC = {
          $set: {
            status: "Premium",
          },
        };
        const result = await usersCollection.updateOne(query, updatedDOC);

        const paymentRecord = {
          amount: session.amount_total / 100,
          currency: session.currency,
          subscriptionType: session.metadata.subscriptionType,
          CustomerName: session.metadata.reporterName,
          CustomerEmail: session.metadata.reporterEmail,
          paymentDate: new Date(),
          transactionId: session.payment_intent,
          paymentStatus: session.payment_status,
        };

        const resultPayment = await paymentCollection.insertOne(paymentRecord);

        return res.send({
          success: true,
          modifyProfile: result,
          transactionId: session.payment_intent,
          paymentInfo: resultPayment,
        });
      }
      return res.send({ success: false });
    });

    app.post(
      "/create-boost-checkout-session",
      verifyFBToken,
      async (req, res) => {
        const paymentInfo = req.body;
        const session = await stripe.checkout.sessions.create({
          line_items: [
            {
              // Provide the exact Price ID (for example, price_1234) of the product you want to sell
              price_data: {
                currency: "bdt",
                product_data: {
                  name: paymentInfo.subscriptionType + "Boost",
                },
                unit_amount: parseInt(paymentInfo.amount * 100), // amount in cents
              },

              quantity: 1,
            },
          ],
          customer_email: paymentInfo.reporterEmail,
          mode: "payment",
          metadata: {
            issueId: paymentInfo.issueId,
            issueName: paymentInfo.issueName,
            reporterName: paymentInfo.reporterName,
            reporterEmail: paymentInfo.reporterEmail,
            subscriptionType: paymentInfo.subscriptionType,
          },
          success_url: `${process.env.SITE_DOMAIN}/dashboard/boost-payment-success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${process.env.SITE_DOMAIN}/dashboard/boost-payment-cancel`,
        });
        res.send({ url: session.url });
      }
    );

    app.patch("/boost-payment-success", verifyFBToken, async (req, res) => {
      const session_id = req.query.session_id;
      const session = await stripe.checkout.sessions.retrieve(session_id);

      const transactionId = session.payment_intent;
      const query = { transactionId: transactionId };
      const existingPayment = await paymentCollection.findOne(query);
      if (existingPayment) {
        return res.send({
          success: true,
          message: "Payment already processed.",
        });
      }

      if (session.payment_status === "paid") {
        const id = session.metadata.issueId;
        const query = { _id: new ObjectId(id) };
        const updatedDOC = {
          $set: {
            Priority: "High",
          },
        };
        const result = await issueCollection.updateOne(query, updatedDOC);

        const paymentRecord = {
          amount: session.amount_total / 100,
          currency: session.currency,
          subscriptionType: session.metadata.subscriptionType,
          CustomerName: session.metadata.reporterName,
          IssueName: session.metadata.issueName,
          IssueId: session.metadata.issueId,
          CustomerEmail: session.metadata.reporterEmail,
          paymentDate: new Date(),
          transactionId: session.payment_intent,
          paymentStatus: session.payment_status,
        };

        const resultPayment = await paymentCollection.insertOne(paymentRecord);

        return res.send({
          success: true,
          modifyProfile: result,
          transactionId: session.payment_intent,
          paymentInfo: resultPayment,
        });
      }
      return res.send({ success: false });
    });

    //payment
    app.get("/payments/:email", verifyFBToken, async (req, res) => {
      const email = req.params.email;
      const query = { CustomerEmail: email };
      if (req.decodedEmail !== email) {
        return res.status(401).send({ message: "Unauthorized" });
      }
      const cursor = paymentCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/payments", verifyFBToken, verifyAdmin, async (req, res) => {
      const cursor = paymentCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    //Issues
    app.get("/issues", async (req, res) => {
      const query = {};
      const { email, searchText, filter, limit, skip } = req.query;

      if (email) {
        query.reporterEmail = email;
      }

      if (searchText) {
        query.$or = [
          { title: { $regex: searchText, $options: "i" } },
          { location: { $regex: searchText, $options: "i" } },
          { category: { $regex: searchText, $options: "i" } },
        ];
      }

      const total = await issueCollection.countDocuments(query);

      let issues = await issueCollection
        .find(query)
        .skip(parseInt(skip))
        .limit(parseInt(limit))
        .toArray();

      const priorityOrder = ["High", "Normal"];
      const statusOrder = [
        "Pending",
        "In-Progress",
        "Working",
        "Resolved",
        "Closed",
      ];
      const categoryOrder = [
        "Road Damage",
        "Water Leakage",
        "Garbage Overflow",
        "Streetlight Issue",
        "Other",
      ];

      if (filter === "Priority") {
        issues.sort(
          (a, b) =>
            priorityOrder.indexOf(a.Priority) -
            priorityOrder.indexOf(b.Priority)
        );
      } else if (filter === "Status") {
        issues.sort(
          (a, b) =>
            statusOrder.indexOf(a.IssueStatus) -
            statusOrder.indexOf(b.IssueStatus)
        );
      } else if (filter === "Category") {
        issues.sort(
          (a, b) =>
            categoryOrder.indexOf(a.category) -
            categoryOrder.indexOf(b.category)
        );
      }

      res.send({ issues, total });
    });

    app.get("/issues/staffs", verifyFBToken, verifyStaff, async (req, res) => {
      const { IssueStatus, staffEmail } = req.query;
      const query = {};
      if (staffEmail) {
        query.staffEmail = staffEmail;
      }

      if (IssueStatus) {
        query.IssueStatus = IssueStatus;
      }

      const cursor = issueCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/issues/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await issueCollection.findOne(query);
      res.send(result);
    });

    app.post("/issues", verifyFBToken, async (req, res) => {
      const issues = req.body;
      const result = await issueCollection.insertOne(issues);
      res.send(result);
    });

    app.patch("/issues/:id/status",verifyFBToken,verifyAdmin,async (req, res) => {
        const id = req.params.id;
        const { IssueStatus } = req.body;
        const query = { _id: new ObjectId(id) };

        const updatedDOC = {
          $set: {
            IssueStatus: IssueStatus,
          },
        };
        const result = await issueCollection.updateOne(query, updatedDOC);
        res.send(result);
      }
    );

    app.patch("/issues/:id/upvote", verifyFBToken, async (req, res) => {
      const id = req.params.id;
      const { userEmail } = req.body;

      if (!userEmail) {
        return res.status(401).send({ message: "Unauthorized" });
      }

      const query = { _id: new ObjectId(id) };
      const issue = await issueCollection.findOne(query);

      if (issue.upvotedBy?.includes(userEmail)) {
        return res.status(409).send({ message: "Already upvoted" });
      }

      const updatedDOC = {
        $inc: { VoteCount: 1 },
        $addToSet: { upvotedBy: userEmail },
      };

      const result = await issueCollection.updateOne(query, updatedDOC);
      res.send({ success: true, VoteCount: issue.VoteCount + 1 });
    });

    app.patch("/issues/:id", verifyFBToken, async (req, res) => {
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

    app.patch("/issues/:id/assign",verifyFBToken,verifyAdmin,async (req, res) => {
        const id = req.params.id;
        const { staffId, staffEmail, staffName, trackingId } = req.body;
        const query = { _id: new ObjectId(id) };

        const updatedDOC = {
          $set: {
            staffId: staffId,
            staffEmail: staffEmail,
            staffName: staffName,
            assignDate: new Date(),
          },
        };

        const result = await issueCollection.updateOne(query, updatedDOC);
        res.send(result);
      }
    );

    app.delete("/issues/:id", verifyFBToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await issueCollection.deleteOne(query);
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
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
