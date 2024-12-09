const dayjs = require("dayjs");
const firebase = require("firebase/app");
const db = require("firebase/firestore");
const shortID = require("short-uuid");
require("whatwg-fetch");
global.XMLHttpRequest = require("xhr2");

const isProd = process.env.NODE_ENV === "production";

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
});
const database = db.getFirestore(app);
const statusRef = db.collection(database, "statuses");
const graphicsRef = db.collection(database, "graphics");

/**
 * usage: insertStatus('online');
 */
function insertStatus(status) {
  return db.setDoc(db.doc(statusRef, shortID().uuid()), {
    status,
    datetime: new Date(),
  });
}

function insertImage(image) {
  return db.setDoc(db.doc(graphicsRef, shortID().uuid()), {
    image,
    datetime: new Date(),
  });
}

async function getLatestStatus() {
  const latestQuery = db.query(
    statusRef,
    db.orderBy("datetime", "desc"),
    db.limit(1)
  );

  const {docs} = await db.getDocs(latestQuery);

  if (!docs.length) return;

  return docs[0].data();
}

async function getLatestImage() {
  const latestQuery = db.query(
    graphicsRef,
    db.orderBy("datetime", "desc"),
    db.limit(1)
  );

  const {docs} = await db.getDocs(latestQuery);

  if (!docs.length) return;

  return docs[0].data();
}

async function getAllStatuses() {
  if (isProd) return [];

  try {
    // get docs and set orderby datetime
    const querySnapshot = await db.getDocs(
      db.query(statusRef, db.orderBy("datetime", "desc"))
    );

    return querySnapshot.docs.map((doc) => {
      const item = doc.data();
      return {
        date: dayjs(item.datetime.seconds * 1000).format("DD.MM.YYYY HH:mm:ss"),
        ...item,
      };
    });
  } catch (e) {
    console.error("getAllStatuses", e);
  }
}

// console.log(insertStatus('online'));

// (async () => {
//   const data = await getLatestStatus();
//   console.log(data.status, dayjs(data.datetime.seconds * 1000).format('DD.MM.YYYY HH:mm:ss'));
// })();

function deleteStatusById(id) {
  return db.deleteDoc(db.doc(database, "statuses", id));
}

// deleteStatusById('0fe611ea-110c-4fe2-8b6d-9cb7a2606a27');

module.exports = {
  insertStatus,
  getLatestStatus,
  deleteStatusById,
  getAllStatuses,

  insertImage,
  getLatestImage,
};
