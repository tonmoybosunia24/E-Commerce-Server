const express = require('express');
const app = express();
require('dotenv').config();
const cors = require('cors');
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

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
              const usersCollection = client.db("E-Commerce").collection("users");
              const productsCollection = client.db("E-Commerce").collection("products");
              const reviewsCollection = client.db("E-Commerce").collection("reviews");
              const blogsCollection = client.db("E-Commerce").collection("blogs");

              // Post Users Data To Database
              app.post('/users', async (req, res) => {
                     // Get The Users Data
                     const user = req.body;
                     // Sent Users Data To MongoDb
                     const result = usersCollection.insertOne(user);
                     // Sent The Response To FrontEnd
                     res.send(result);
              })
              // Get All Products
              app.get('/allProducts', async (req, res) => {
                     // Pagination For Products
                     const page = parseInt(req.query.page) || 1;
                     const limit = parseInt(req.query.limit) || 12;
                     const skip = (page - 1) * limit;
                     // Search For Products
                     const search = req.query.search || '';
                     // Sorting For Products
                     const sort = req.query.sort || 'name-asc'
                     const sortMap = { 'name-asc': { Title: 1 }, 'name-desc': { Title: -1 }, 'price-asc': { Price: 1 }, 'price-desc': { Price: -1 } };
                     const sortOption = sortMap[sort];
                     // Query For Stop Sending Unwanted Products
                     const query = { Title: { $exists: true, $ne: '' } };
                     // Add search filter
                     if (search && search.trim() !== '') {
                            query.$or = [
                                   { Title: { $regex: search.trim(), $options: 'i' } },
                                   { SubCategory: { $regex: search.trim(), $options: 'i' } },
                                   { Title: { $regex: search, $options: 'i' } },
                                   { SubCategory: { $regex: search, $options: 'i' } },
                                   { Brand: { $regex: search, $options: 'i' } },
                                   { Description: { $regex: search, $options: 'i' } }
                            ];
                     }
                     // Filters For Products Availability
                     if (req.query.availability) {
                            const availabilityValues = req.query.availability.split(',');
                            query.AvailabilityStatus = { $in: availabilityValues };
                     }
                     // Filters For Products Size
                     if (req.query.size) {
                            const sizeValues = req.query.size.split(',');
                            query.Variant = { $in: sizeValues };
                     }
                     // Filters For Products Color
                     if (req.query.color) {
                            const colorValues = req.query.color.split(',');
                            query.Colors = { $in: colorValues };
                     }
                     // Filters For Products Price Slider
                     if (req.query.minPrice && req.query.maxPrice) {
                            query.Price = { $gte: Number(req.query.minPrice), $lte: Number(req.query.maxPrice) };
                     }
                     // Filters For Products Brands
                     if (req.query.brands) {
                            const brandsValues = req.query.brands.split(',');
                            query.Brand = { $in: brandsValues }
                     }
                     // Dynamic Counts For Size
                     const sizeOptions = ['S', 'M', 'L', 'XL', 'XXL'];
                     const sizeCounts = {};
                     for (const size of sizeOptions) {
                            sizeCounts[size] = await productsCollection.countDocuments({
                                   Variant: { $in: [size] }
                            });
                     }
                     // Dynamic Counts For Availability
                     const availabilityOptions = ['In Stock', 'Limited Stock', 'Not Available'];
                     const availabilityCounts = {};
                     for (const status of availabilityOptions) {
                            availabilityCounts[status] = await productsCollection.countDocuments({ AvailabilityStatus: status });
                     }
                     // Dynamic Counts For Colors
                     const colorOptions = ['#FF0000', '#000000', '#FFFFFF', '#CCCCCC'];
                     const colorCounts = {};
                     for (const color of colorOptions) {
                            colorCounts[color] = await productsCollection.countDocuments({ Colors: color });
                     }
                     // Dynamic Counts For Brand
                     const brandsOptions = ['Apple', 'Samsung', 'Sony', 'Nike'];
                     const brandsCounts = {};
                     for (const brands of brandsOptions) {
                            brandsCounts[brands] = await productsCollection.countDocuments({ Brand: brands });
                     }
                     // All Products Sending To FrontEnd
                     const allProducts = await productsCollection.find(query).sort(sortOption).skip(skip).limit(limit).toArray();
                     const total = await productsCollection.countDocuments(query)
                     res.send({ allProducts, totalPages: Math.ceil(total / limit), currentPage: page, limit, counts: { size: sizeCounts, availability: availabilityCounts, color: colorCounts, brands: brandsCounts } });
              })
              // Get Single Product With Related Products
              app.get('/productDetails/:id', async (req, res) => {
                     const id = req.params.id;
                     // Object Id Validation
                     if (!ObjectId.isValid(id)) {
                            return res.status(400).send({ error: 'Invalid product ID' });
                     }
                     // Find Single Product Form Id
                     const product = await productsCollection.findOne({ _id: new ObjectId(id) })
                     // Find Related Products From Single Product Category
                     const relatedProducts = await productsCollection.find({
                            Category: { $regex: new RegExp(`^${product.Category?.trim()}$`, 'i') },
                            _id: { $ne: new ObjectId(id) }
                     }).limit(10).toArray();
                     // Sending Single Product And Related Product To FrontEnd
                     res.send({ product, relatedProducts });
              })
              // Get All Category 
              app.get('/categories', async (req, res) => {
                     // Find All Category
                     const categories = await productsCollection.distinct("Category");
                     // Send Category To FrontEnd
                     res.send(categories);
              })
              // Get Category Products
              app.get('/categoryProducts', async (req, res) => {
                     const query = req.query; /* ----------Query For String To Object---------- */
                     // Find The Category Paramiter
                     const booleanFields = ['isNewArrival', 'isBestSeller', 'isOnSale']
                     booleanFields.forEach(field => {
                            if (query[field] !== undefined) {
                                   query[field] = query[field] === 'true';
                            }
                     })
                     // Find The Category Products
                     const products = await productsCollection.find(query).limit(10).toArray();
                     // Send Cateogory Products To FrontEnd 
                     res.send(products);
              });
              // Get All Reviews
              app.get('/reviews', async (req, res) => {
                     // Find ALl The Reviews
                     const reviews = await reviewsCollection.find().toArray();
                     // Send Reviews Products To FrontEnd 
                     res.send(reviews);
              })
              // Get All Blogs
              app.get('/blogs', async (req, res) => {
                     // Find ALl The Blogs
                     const blogs = await blogsCollection.find().toArray();
                     // Send Blogs To FrontEnd
                     res.send(blogs);
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