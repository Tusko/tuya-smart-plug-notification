const firebase = require("firebase/app");
const db = require("firebase/firestore");
const shortID = require('short-uuid');
require('whatwg-fetch');
global.XMLHttpRequest = require('xhr2');

const firebaseConfig = {
  apiKey: "AIzaSyAShFR7w7wkVjjVldhX8_DlaEAoAomKB7k",
  authDomain: "de-svitlo-e.firebaseapp.com",
  projectId: "de-svitlo-e",
  storageBucket: "de-svitlo-e.appspot.com",
  messagingSenderId: "607971644265",
  appId: "1:607971644265:web:e68bed46da7fd0b0bfe3f8",
  measurementId: "G-1E07THS6BL",
};

const app = firebase.initializeApp(firebaseConfig);

const firestoreDB = db.initializeFirestore(app, {
  experimentalForceLongPolling: true,
  useFetchStreams: false,
})
const database = db.getFirestore(app);
const statusRef = db.collection(database, "statuses");

/**
 * usage: insertStatus('online');
 */
function insertStatus(status) {
  return db.setDoc(db.doc(statusRef, shortID().uuid()), {
    status,
    datetime: new Date()
  });
}

async function getLatestStatus() {
  const latestQuery = db.query(statusRef, db.orderBy("datetime", "desc"), db.limit(1));

  const {docs} = await db.getDocs(latestQuery)

  return docs[0].data();
}

// console.log(insertStatus('online'));

// (async () => {
//   const data = await getLatestStatus();
//   console.log(data.status, dayjs(data.datetime.seconds * 1000).format('DD.MM.YYYY HH:mm:ss'));
// })();

function deleteStatusById(id) {
  return db.deleteDoc(db.doc(database, "statuses", id));
}

// deleteStatusById('bf9ad562-8a54-4ff6-9e4e-beb5af61b76c');

module.exports = {
  insertStatus,
  getLatestStatus,
  deleteStatusById
}