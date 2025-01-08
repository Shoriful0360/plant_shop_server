require('dotenv').config()
const express = require('express')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
const jwt = require('jsonwebtoken')
const morgan = require('morgan')

const port = process.env.PORT || 9000
const app = express()
// middleware
const corsOptions = {
  origin: ['http://localhost:5173', 'http://localhost:5174','http://localhost:5177'],
  credentials: true,
  optionSuccessStatus: 200,
}
app.use(cors(corsOptions))

app.use(express.json())
app.use(cookieParser())
app.use(morgan('dev'))

const verifyToken = async (req, res, next) => {
  const token = req.cookies?.token

  if (!token) {
    return res.status(401).send({ message: 'unauthorized access' })
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      console.log(err)
      return res.status(401).send({ message: 'unauthorized access' })
    }
    req.user = decoded
    next()
  })
}

const uri = `mongodb+srv://${process.env.USER_KEY}:${process.env.PASSWORD_KEY}@cluster0.onkli.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`


// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
})
async function run() {
  try {

    // create collection
    const plantsCollection=client.db('plant_shop').collection('plants')
    const userCollection=client.db('plant_shop').collection('users')
    const orderCollection=client.db('plant_shop').collection('order')



    // Generate jwt token
    app.post('/jwt', async (req, res) => {
      const email = req.body
      const token = jwt.sign(email, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '365d',
      })
      res
        .cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        })
        .send({ success: true })
    })
    // Logout
    app.get('/logout', async (req, res) => {
      try {
        res
          .clearCookie('token', {
            maxAge: 0,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
          })
          .send({ success: true })
      } catch (err) {
        res.status(500).send(err)
      }
    })

    // user create and collection
    app.post('/user/:email',async(req,res)=>{
      const email=req.params.email
      const user=req.body;
      const query={email}

      const isExist=await userCollection.findOne(query)
      if(isExist){
        return res.send(isExist)
      }
      const result=await userCollection.insertOne({
        ...user,
        role:'customer',
       timeStamp:Date.now()
      })
      res.send(result)
    })

    // plants collection
    app.post('/plant',async(req,res)=>{
      const plants=req.body;
      const result=await plantsCollection.insertOne(plants)
      res.send(result)
    })

    // get plants data from plants collection
    app.get('/plant',async(req,res)=>{
      const result=await plantsCollection.find().toArray()
      res.send(result)
    })

    // get one plant by id
    app.get('/plant/:id',async(req,res)=>{
      const id=req.params.id;
      const query={_id: new ObjectId(id)}
      const result=await plantsCollection.findOne(query)
      res.send(result)
    })



    // order related api
    app.post('/order',verifyToken,async(req,res)=>{
      const orderInfo=req.body;
      console.log(orderInfo)
      const result=await orderCollection.insertOne(orderInfo)
      res.send(result)
    })

    // update quantity
    app.patch('/plant/quantity/:id',verifyToken,async(req,res)=>{
      const id=req.params.id;
      const query={_id: new ObjectId(id)}
      const{quantityUpdate,status}=req.body;
     
   let updateDoc={
        $inc:{quantity: -quantityUpdate}
      }
      if(status==='increase'){
       updateDoc={
          $inc:{quantity: quantityUpdate}
        }
      }
      const result=await plantsCollection.updateOne(query,updateDoc)
      res.send(result)
    })

    // get order data 
    app.get('/order/:email',async(req,res)=>{
      const email=req.params.email;
    
      const query={"customerInfo.email":email}
      const result=await orderCollection.aggregate([
        {
          $match:query, //Match specefic customers data only by eamil
        },
        {
          $addFields:{
            PlantId:{$toObjectId:'$PlantId'} //conver plant id string field to objectId field
          }
        },
        {
          $lookup:{  //go to difference collection and look for data
            from:'plants', 
            localField:'PlantId', //local data that you want to match 
            foreignField:'_id', //Foreign field name of that same data
            as:'plantInfo', //return the data as plants array
          }
        },

        // convert object array of data &unwind   
        {
          $unwind:'$plantInfo'
        },

        // some data remove in plant info as for that  add filed
        {
          $addFields:{
            ImageName:'$plantInfo.name',
            Image:'$plantInfo.imgUrl',
            category:'$plantInfo.category',
          }
        },
        // specefic get data from plant info then remove plant info note: if 1 then give this data and remove another data, if 0 then remove this data and give another data
        {
          $project:{
            plantInfo:0,
          }
        }
       
      ])
      .toArray()
      res.send(result)
    })


    // delet order
    app.delete('/order/:id',verifyToken,async(req,res)=>{
      const id=req.params.id;
      const query={_id: new ObjectId(id)}
      const order=await orderCollection.findOne(query)
      if(order.status ==='delivered'){
        return res.status(409).send('you cannot cancel because of this purcel havebeen delivered')
      }
      const result=await orderCollection.deleteOne(query)
      res.send(result)
    })


    // Send a ping to confirm a successful connection
    await client.db('admin').command({ ping: 1 })
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    )
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir)

app.get('/', (req, res) => {
  res.send('Hello from plantNet Server..')
})

app.listen(port, () => {
  console.log(`plantNet is running on port ${port}`)
})
