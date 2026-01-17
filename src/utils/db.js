import dayjs from "dayjs";
import shortID from "short-uuid";

// Firebase Firestore REST API helper
class FirestoreREST {
  constructor(env) {
    this.projectId = env.FIREBASE_PROJECT_ID;
    this.apiKey = env.FIREBASE_API_KEY;
    this.baseUrl = `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents`;
  }

  // Convert Firestore REST API format to simple object
  parseDocument(doc) {
    if (!doc || !doc.fields) return null;

    const data = {};
    for (const [key, value] of Object.entries(doc.fields)) {
      if (value.stringValue !== undefined) {
        data[key] = value.stringValue;
      } else if (value.integerValue !== undefined) {
        data[key] = parseInt(value.integerValue);
      } else if (value.timestampValue !== undefined) {
        data[key] = { seconds: new Date(value.timestampValue).getTime() / 1000 };
      } else if (value.booleanValue !== undefined) {
        data[key] = value.booleanValue;
      }
    }
    return data;
  }

  // Convert simple object to Firestore REST API format
  toFirestoreDocument(data) {
    const fields = {};
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'string') {
        fields[key] = { stringValue: value };
      } else if (typeof value === 'number') {
        fields[key] = { integerValue: value.toString() };
      } else if (typeof value === 'boolean') {
        fields[key] = { booleanValue: value };
      } else if (value instanceof Date) {
        fields[key] = { timestampValue: value.toISOString() };
      }
    }
    return { fields };
  }

  // Create a document
  async createDocument(collection, documentId, data) {
    const url = `${this.baseUrl}/${collection}?documentId=${documentId}&key=${this.apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(this.toFirestoreDocument(data))
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Firestore create failed: ${error}`);
    }

    return response.json();
  }

  // Query documents with ordering and limit
  async queryDocuments(collection, orderByField, orderDirection = 'DESCENDING', limitCount = 1) {
    const url = `${this.baseUrl}:runQuery?key=${this.apiKey}`;
    const query = {
      structuredQuery: {
        from: [{ collectionId: collection }],
        orderBy: [{ field: { fieldPath: orderByField }, direction: orderDirection }],
        limit: limitCount
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(query)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Firestore query failed: ${error}`);
    }

    const results = await response.json();
    return results
      .filter(r => r.document)
      .map(r => ({
        id: r.document.name.split('/').pop(),
        ...this.parseDocument(r.document)
      }));
  }

  // Delete a document
  async deleteDocument(collection, documentId) {
    const url = `${this.baseUrl}/${collection}/${documentId}?key=${this.apiKey}`;
    const response = await fetch(url, { method: 'DELETE' });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Firestore delete failed: ${error}`);
    }

    return response.json();
  }
}

/**
 * usage: insertStatus('online', env);
 */
export async function insertStatus(status, env = process.env) {
  const db = new FirestoreREST(env);
  const documentId = shortID().uuid();

  return db.createDocument('statuses', documentId, {
    status,
    datetime: new Date(),
  });
}

export async function insertImage(image, env = process.env) {
  const db = new FirestoreREST(env);
  const documentId = shortID().uuid();

  return db.createDocument('graphics', documentId, {
    image,
    datetime: new Date(),
  });
}

export const insertNextNotification = async (date, env = process.env) => {
  const db = new FirestoreREST(env);
  const documentId = shortID().uuid();

  // check if notification already exists with same date
  const latestNotification = await getLatestNotification(env);
  if(latestNotification === date) {
    return;
  }

  return db.createDocument('notifications', documentId, {
    date,
    datetime: new Date(),
  });
}
// get latest notification
export async function getLatestNotification(env = process.env) {
  const db = new FirestoreREST(env);
  const results = await db.queryDocuments('notifications', 'datetime', 'DESCENDING', 1);
  return results?.[0]?.date;
}

export async function getLatestStatus(env = process.env) {
  const db = new FirestoreREST(env);
  const results = await db.queryDocuments('statuses', 'datetime', 'DESCENDING', 1);

  return results.length > 0 ? results[0] : null;
}

export async function getLatestImage(env = process.env) {
  const db = new FirestoreREST(env);
  const results = await db.queryDocuments('graphics', 'datetime', 'DESCENDING', 1);

  return results.length > 0 ? results[0] : null;
}

export async function getAllStatuses(env = process.env) {
  const isProd = Boolean(env.NODE_ENV === 'production');
  if (isProd) return [];

  try {
    const db = new FirestoreREST(env);
    const results = await db.queryDocuments('statuses', 'datetime', 'DESCENDING', 100);

    return results.map((item) => ({
      date: dayjs(item.datetime.seconds * 1000).format("DD.MM.YYYY HH:mm:ss"),
      ...item,
    }));
  } catch (e) {
    console.error("getAllStatuses", e);
    return [];
  }
}

export function deleteStatusById(id, env = process.env) {
  const db = new FirestoreREST(env);
  return db.deleteDocument('statuses', id);
}

// Save groups state
export async function saveGroupsState(groupsData, env = process.env) {
  const db = new FirestoreREST(env);
  const documentId = shortID().uuid();

  return db.createDocument('groups_state', documentId, {
    groupsData: JSON.stringify(groupsData),
    datetime: new Date(),
  });
}

// Get latest groups state
export async function getLatestGroupsState(env = process.env) {
  const db = new FirestoreREST(env);
  const results = await db.queryDocuments('groups_state', 'datetime', 'DESCENDING', 1);

  if (results.length > 0 && results[0].groupsData) {
    try {
      return JSON.parse(results[0].groupsData);
    } catch (e) {
      console.error("Error parsing groups state:", e);
      return null;
    }
  }

  return null;
}
