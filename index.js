const express = require('express');
const app = express();
require('dotenv').config();
const cors = require('cors');
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion } = require('mongodb');

// Middleware
app.use(express.json());
app.use(cors());

// MongoDB Connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.4vklw.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
       serverApi: {
              version: ServerApiVersion.v1,
              strict: false,
              deprecationErrors: false,
       }
});
async function run() {
       try {
              // Connect the client to the server (optional starting in v4.7)
              await client.connect();

              // MongoDb Database Collections
              const productsCollection = client.db("E-Commerce").collection("products");
              const reviewsCollection = client.db("E-Commerce").collection("reviews");

              // Get All Category 
              app.get('/categories', async (req, res) => {
                     const categories = await productsCollection.distinct("Category");
                     res.send(categories)
              })
              // Get Category Products
              app.get('/categoryProducts', async (req, res) => {
                     const query = req.query; /* ----------Query For String To Object---------- */
                     const booleanFields = ['isNewArrival', 'isBestSeller', 'isOnSale']
                     booleanFields.forEach(field => {
                            if(query[field] !== undefined){
                                   query[field] = query[field] === 'true';
                            }
                     })
                     const products = await productsCollection.find(query).limit(10).toArray();
                     res.send(products);
              });
              // Get All Reviews
              app.get('/reviews', async (req, res) => {
                     const reviews = await reviewsCollection.find().toArray()
                     res.send(reviews)
              })

              // Send a ping to confirm a successful connection
              await client.db("admin").command({ ping: 1 });
              console.log("Pinged your deployment. You successfully connected to MongoDB!");
       } finally {
              // Ensures that the client will close when you finish/error
              //   await client.close();
       }
}
run().catch(console.dir);

app.get('/', (req, res) => {
       res.send('E-Commerce-Server Is Running');
})

app.listen(port, () => {
       console.log(`Server is running on port ${port}`);
})