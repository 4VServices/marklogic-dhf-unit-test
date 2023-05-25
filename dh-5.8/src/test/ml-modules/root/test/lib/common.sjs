"use strict";

/**
 * Create a user for testing.
 * @param username A String with the username to create.
 * @param roles An Array of Strings with role names.
 * @return undefined
 */
function createTestUser(username, roles) {
  xdmp.invokeFunction(
    () => {
      const sec = require("/MarkLogic/security.xqy");
      if (!sec.userExists(username)) {
        const password = sem.uuidString();

        sec.createUser(
          username,
          "User for unit testing",
          password,
          roles,
          null,
          null
        );
      }
    },
    {
      database: xdmp.securityDatabase(),
      update: "true",
    }
  );
}

/**
 *
 * @param sourceDB String; required. The name of the source database to copy from.
 * @param testDB String; required. The name of the test database to copy to.
 */
function loadDHDatabaseArtifacts(sourceDB, testDB) {
  const op = require("/MarkLogic/optic");
  const DH_DIRECTORIES = [
    "/entities/",
    "/flows/",
    "/steps/",
    "/step-definitions/",
  ];
  // Gather document descriptors for DH artifacts from the source database.
  let dhDocs = fn.head(
    runAsQuery(
      () =>
        op
          .fromDocUris(cts.directoryQuery(DH_DIRECTORIES, "infinity"))
          .joinDocCols(op.docCols(), op.fragmentIdCol("fragmentId"))
          .result()
          .toArray(),
      { database: xdmp.database(sourceDB) }
    )
  );
  // Write the document descriptors to the test database.
  runAsUpdate(() => op.fromDocDescriptors(dhDocs).write().result(), {
    update: "true",
    database: xdmp.database(testDB),
  });
}

const LAST_LOADED_FIELD = "lastLoadedDHArtifacts";
/**
 * Load DH artifacts from staging & final databases to their test equivalents. Data Hub expects entities, flows, and
 * other artifacts to be present in the content databases. We do this for the test environment to provide consistency
 * but also become some tests will require them (if they are running flows or otherwise working with Data Hub).
 * For performance, track the last time the artifacts were copied using a server field. As DH artifacts don't change
 * during a test run, we don't need to reload them separately for each test case or even suite.
 * @param checkLoadDT
 * @param seconds
 */
function loadDHArtifacts(checkLoadDT = true, seconds = 60) {
  const now = fn.currentDateTime();
  const expireDuration = xs.dayTimeDuration(`PT0H0M${seconds}S`);
  const lastLoaded = xs.dateTime(
    xdmp.getServerField(LAST_LOADED_FIELD, now.subtract(expireDuration))
  );
  const expireAt = lastLoaded.add(expireDuration);
  const loadExpired = now.ge(expireAt);
  if (loadExpired || checkLoadDT === false) {
    loadDHDatabaseArtifacts("%%mlStagingDbName%%", "%%mlStagingDbName%%-TEST");
    loadDHDatabaseArtifacts("%%mlFinalDbName%%", "%%mlFinalDbName%%-TEST");
    xdmp.setServerField(LAST_LOADED_FIELD, now);
  }
}

/**
 * Removing DH Artifacts.
 * We have observed that removing DH artifacts triggers updates that remove important documents from the modules
 * database. To prevent this from happening, we do not remove the DH artifacts as part of teardown.
 */

/**
 * Delete a user by username.
 * @param username A String with the username to delete.
 */
function removeTestUser(username) {
  xdmp.invokeFunction(
    () => {
      const sec = require("/MarkLogic/security.xqy");
      sec.removeUser(username);
    },
    {
      database: xdmp.securityDatabase(),
      update: "true",
    }
  );
}

/**
 * Create a Secure Credential for testing.
 * @param credentialName
 * @param roles
 * @param path
 * @param targetPort
 * @param auth
 */
function createTestCredential(
  credentialName,
  roles,
  path,
  targetPort,
  auth = "digest"
) {
  xdmp.invokeFunction(
    () => {
      const sec = require("/MarkLogic/security.xqy");
      if (
        !sec
          .getCredentialNames()
          .toArray()
          .some((currName) => currName.toString() === credentialName)
      ) {
        const username = `%%mlAppName%%-test-user-${credentialName}-${sem.uuidString()}`;
        const password = sem.uuidString();

        sec.createUser(
          username,
          "User for unit testing",
          password,
          roles,
          null,
          null
        );

        sec.createCredential(
          credentialName,
          "Credential for unit testing",
          username,
          password,
          null,
          null,
          false,
          sec.uriCredentialTarget(
            `http://%%mlHost%%:${targetPort}${path}`,
            auth
          ),
          null
        );
      }
    },
    {
      database: xdmp.securityDatabase(),
      update: "true",
    }
  );
}

/**
 * Remove a Secure Credential
 * @param credentialName
 */
function removeTestCredential(credentialName) {
  xdmp.invokeFunction(
    () => {
      const sec = require("/MarkLogic/security.xqy");
      sec.removeUser(sec.credentialGetUsername(credentialName));
      sec.removeCredential(credentialName);
    },
    {
      database: xdmp.securityDatabase(),
      update: "true",
    }
  );
}

/**
 * Runs the provided function in a separate update transaction.
 * @param func a zero-arity function
 * @return the response from the function in a Sequence
 */
function runAsUpdate(func, options) {
  return xdmp.invokeFunction(func, Object.assign({ update: "true" }, options));
}

/**
 * Runs the provided function in a separate query request.
 * @param func a zero-arity function
 * @return the response from the function in a Sequence
 */
function runAsQuery(func, options) {
  return xdmp.invokeFunction(func, Object.assign({ update: "false" }, options));
}

module.exports = {
  createTestUser,
  removeTestUser,
  createTestCredential,
  removeTestCredential,
  runAsUpdate,
  runAsQuery,
  loadDHArtifacts,
};
