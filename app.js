const express = require("express");
const app = express();
const path = require("path");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
let db = null;
let dbPath = path.join(__dirname, "twitterClone.db");

app.use(express.json());

const authenticator = async (request, response, next) => {
  //checking token
  let jwtToken = null;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_KEY", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

const initializeDB = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Database and Server connection is established");
    });
  } catch (error) {
    console.log(error.message);
    process.exit(1);
  }
};

function checkListofId(responseArray) {
  let idArray = [];
  for (let object of responseArray) {
    idArray.push(object.tweet_id);
  }
  return idArray;
}

function getNamesFromResponse(objArray) {
  let nameList = [];
  for (let obj of objArray) {
    nameList.push(obj.username);
  }
  return nameList;
}

function getObjectsFromResponse(objArray) {
  let replyListArray = [];
  for (let object of objArray) {
    replyListArray.push(object);
  }
  return replyListArray;
}

initializeDB();

//REGISTER API
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const userExits = `select count(*) as count from user where username = '${username}';`;
  let dbResponse = await db.get(userExits);
  if (dbResponse.count > 0) {
    response.status(400);
    response.send("User already exists");
  } else {
    let passwordLength = password.length;
    if (passwordLength > 5) {
      let hashedPassword = await bcrypt.hash(password, 10);
      const insertUserQuery = `INSERT INTO user(name,username,password,gender) VALUES('${name}','${username}','${hashedPassword}','${gender}');`;
      dbResponse = await db.run(insertUserQuery);
      response.status(200);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  }
});

//LOGIN API

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const checkUserExits = `SELECT * FROM user WHERE username = '${username}';`;
  let dbResponse = await db.get(checkUserExits);
  if (dbResponse === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    let isPasswordCorrect = await bcrypt.compare(password, dbResponse.password);
    if (isPasswordCorrect) {
      let jwtToken = null;
      let payload = { username: username };
      jwtToken = await jwt.sign(payload, "MY_SECRET_KEY");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//API-3

app.get("/user/tweets/feed/", authenticator, async (request, response) => {
  const userName = request.username;
  //const getUserFeed = `select user.name as username,tweet.tweet as tweet,tweet.date_time as dateTime from follower INNER JOIN user on follower.following_user_id = user.user_id inner join tweet on tweet.user_id = user.user_id where follower_user_id = (select user_id from user where username='${userName}') ORDER BY tweet.date_time DESC LIMIT 4;`;
  const getUserFeed = `select T.username as username,tw.tweet as tweet,tw.date_time as dateTime from follower inner join user as T on follower.following_user_id = T.user_id INNER JOIN tweet as tw ON T.user_id = tw.user_id  where follower_user_id = (select user_id from user where username = '${userName}') ORDER BY tw.date_time DESC LIMIT 4;`;
  let dbResponse = await db.all(getUserFeed);

  response.send(dbResponse);
});

//API-4

app.get("/user/following/", authenticator, async (request, response) => {
  const userName = request.username;
  //const getUserFollowsList = `select user.name as name from follower INNER JOIN user on follower.following_user_id = user.user_id where follower_user_id = (select user_id from user where username='${userName}');`;
  const getUserFollowList = `select T.name from follower INNER JOIN user as T on T.user_id=follower.following_user_id where follower_user_id = (SELECT user_id from user where username='${userName}');`;
  let dbResponse = await db.all(getUserFollowList);
  response.send(dbResponse);
});

//API-5
app.get("/user/followers/", authenticator, async (request, response) => {
  const userName = request.username;
  const getFollowerList = `select user.name as name from follower INNER JOIN USER ON user.user_id = follower.follower_user_id where follower.following_user_id = (select user_id from user where username='${userName}');`;
  let dbResponse = await db.all(getFollowerList);
  response.send(dbResponse);
});

//API-6
app.get("/tweets/:tweetId/", authenticator, async (request, response) => {
  //get the list of tweet id's of whom user follows
  const userName = request.username;
  let { tweetId } = request.params;
  tweetId = parseInt(tweetId);
  const getListOfTweetIds = `select tweet.tweet_id from follower INNER JOIN tweet on tweet.user_id = follower.following_user_id where follower_user_id = (select user_id from user where username='${userName}');`;
  let listOfTweets = await db.all(getListOfTweetIds);
  let arrayListofId = checkListofId(listOfTweets);
  let found = arrayListofId.find(function (element) {
    if (element === tweetId) {
      return true;
    }
  });
  if (found === tweetId) {
    const responseObject = {
      tweet: null,
      likes: null,
      replies: null,
      dateTime: null,
    };
    const getTweet = `SELECT tweet,date_time from tweet where tweet_id = ${tweetId};`;
    let getTweetResponse = await db.get(getTweet);
    const getLikeCount = `select count(like_id) as count from like where tweet_id = ${tweetId} group by tweet_id;`;
    let getLikeCountResponse = await db.get(getLikeCount);
    const getRepliesCount = `select count(reply_id) as count from reply where tweet_id = ${tweetId} group by tweet_id;`;
    let getReplyCountResponse = await db.get(getRepliesCount);
    responseObject.tweet = getTweetResponse.tweet;
    responseObject.dateTime = getTweetResponse.date_time;
    responseObject.likes = getLikeCountResponse.count;
    responseObject.replies = getReplyCountResponse.count;
    response.send(responseObject);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

//API-7

app.get("/tweets/:tweetId/likes/", authenticator, async (request, response) => {
  const userName = request.username;
  let { tweetId } = request.params;
  tweetId = parseInt(tweetId);
  const getListOfTweetIds = `select tweet.tweet_id from follower INNER JOIN tweet on tweet.user_id = follower.following_user_id where follower_user_id = (select user_id from user where username='${userName}');`;
  let listOfTweets = await db.all(getListOfTweetIds);
  let arrayListofId = checkListofId(listOfTweets);
  let found = arrayListofId.find(function (element) {
    if (element === tweetId) {
      return true;
    }
  });
  if (found === tweetId) {
    const responseObject = {
      likes: null,
    };
    const getLikedUsers = `select user.username as username from like inner join user on like.user_id = user.user_id where tweet_id = ${tweetId};`;
    let getLikedUserResponse = await db.all(getLikedUsers);
    let nameList = getNamesFromResponse(getLikedUserResponse);
    responseObject.likes = nameList;
    response.send(responseObject);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

//API-8
app.get(
  "/tweets/:tweetId/replies/",
  authenticator,
  async (request, response) => {
    const userName = request.username;
    let { tweetId } = request.params;
    tweetId = parseInt(tweetId);
    const getListOfTweetIds = `select tweet.tweet_id from follower INNER JOIN tweet on tweet.user_id = follower.following_user_id where follower_user_id = (select user_id from user where username='${userName}');`;
    let listOfTweets = await db.all(getListOfTweetIds);
    let arrayListofId = checkListofId(listOfTweets);
    let found = arrayListofId.find(function (element) {
      if (element === tweetId) {
        return true;
      }
    });
    if (found === tweetId) {
      const responseObject = { replies: null };
      const getRepliesForTweet = `select user.name as name,reply as reply from reply INNER JOIN user on reply.user_id = user.user_id where tweet_id = ${tweetId};`;
      let getRepliesResponse = await db.all(getRepliesForTweet);
      let responseArrayOfObjects = getObjectsFromResponse(getRepliesResponse);
      responseObject.replies = responseArrayOfObjects;
      response.send(responseObject);
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API-9
app.get("/user/tweets/", authenticator, async (request, response) => {
  const userName = request.username;
  const getTweets = `SELECT tweet_id FROM tweet where user_id = (SELECT user_id from user where username = '${userName}') ;`;
  let getTweetsResponse = await db.all(getTweets);
  let arrayOfTweetIds = [];
  for (let obj of getTweetsResponse) {
    arrayOfTweetIds.push(obj.tweet_id);
  }
  let responseArray = [];
  let responseArrayObj = {
    tweet: null,
    likes: null,
    replies: null,
    dateTime: null,
  };
  for (let tweet_id of arrayOfTweetIds) {
    const getTweet = `SELECT tweet,date_time as dateTime from tweet where tweet_id = ${tweet_id}`;
    let getTweetResponse = await db.get(getTweet);
    const getLikes = `SELECT count(like_id) as count from like where tweet_id = ${tweet_id};`;
    let getLikesResponse = await db.get(getLikes);
    const getReplies = `SELECT count(reply_id) as count from reply where tweet_id = ${tweet_id};`;
    let getRepliesResponse = await db.get(getReplies);
    let responseArrayObj = {
      tweet: null,
      likes: null,
      replies: null,
      dateTime: null,
    };
    responseArrayObj.tweet = getTweetResponse.tweet;
    responseArrayObj.dateTime = getTweetResponse.dateTime;
    responseArrayObj.likes = getLikesResponse.count;
    responseArrayObj.replies = getRepliesResponse.count;
    responseArray.push(responseArrayObj);
  }
  response.send(responseArray);
});

//API-10
app.post("/user/tweets/", authenticator, async (request, response) => {
  const { tweet } = request.body;
  const userName = request.name;
  const postTweet = `INSERT INTO tweet(tweet) values('${tweet}');`;
  let postTweetResponse = await db.run(postTweet);
  response.send("Created a Tweet");
});

//API-11

app.delete("/tweets/:tweetId/", authenticator, async (request, response) => {
  let { tweetId } = request.params;
  const userName = request.username;
  tweetId = parseInt(tweetId);
  const getUserTweets = `select tweet_id from tweet where user_id = (select user_id from user where username = '${userName}');`;
  let getUserTweetsResponse = await db.all(getUserTweets);
  let arrayListofId = checkListofId(getUserTweetsResponse);
  let found = arrayListofId.find(function (element) {
    if (element === tweetId) {
      return true;
    }
  });
  if (found === tweetId) {
    const deleteTweet = `DELETE FROM tweet where tweet_id = ${tweetId}`;
    let deleteTweetResponse = await db.run(deleteTweet);
    response.send("Tweet Removed");
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});
module.exports = app;
