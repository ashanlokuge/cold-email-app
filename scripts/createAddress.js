// server.mjs (or keep server.js with "type":"module" in package.json)
import { CommunicationServiceManagementClient } from "@azure/arm-communication";
import { AzureCliCredential } from "@azure/identity";

const credential = new AzureCliCredential();
const subscriptionId = "f7e1ae6c-cb61-402d-9181-1e11ca111d7a";

const mgmtClient = new CommunicationServiceManagementClient(credential, subscriptionId);

const resourceGroupName = "testsite";
const emailServiceName = "ColdEmail";
const domainName = "cold.digiquarter.com";

// add/adjust as you like – username is the local part (before @)
const senders = [
  { username: "imesh",   displayName: "imesh L" },
  // { username: "alex",     displayName: "Alex" },
  // { username: "support",  displayName: "Support" },
  // { username: "sales",    displayName: "Sales" },
  // { username: "promo",  displayName: "Promo" },
];

async function upsertSender({ username, displayName }) {
  return mgmtClient.senderUsernames.createOrUpdate(
    resourceGroupName,
    emailServiceName,
    domainName,
    username,                      // resource name = local-part
    { username, displayName }      // body.username MUST match the path name
  );
}

(async () => {
  const ok = [];
  const fail = [];
  for (const s of senders) {
    try {
      await upsertSender(s);
      ok.push(s.username);
      console.log(`✅ created/updated: ${s.username}@${domainName}`);
    } catch (err) {
      fail.push({ username: s.username, code: err?.code ?? err?.statusCode, msg: err?.message });
      console.error(`❌ failed: ${s.username}@${domainName}`, err?.message);
    }
  }

  console.log("\nSummary");
  console.log("Success:", ok);
  console.log("Failed:", fail);
})();
