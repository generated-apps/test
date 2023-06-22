import { Octokit } from "@octokit/rest";
import { globby } from "globby";
import path from "path";
import pkg from "fs-extra";
import { fileURLToPath } from "url";
import { dirname } from "path";
import dotenv from "dotenv";
dotenv.config();

const { readFile } = pkg;
// org or owner
const ORGANIZATION = "generated-apps";
const REPO = "test";
const BRANCH = "main";
const COMMIT_MESSAGE = "Auto generated";

const main = async () => {
  const octo = new Octokit({
    auth: process.env.GITHUB_TOKEN,
  });
  // listForOrg(org) or listForUser(username)
  const repos = await octo.rest.repos.listForOrg({
    org: ORGANIZATION,
  });
  const repoNames = repos.data.map((repo) => repo.name);
  console.log("NAMES", repoNames);
  if (!repoNames.includes(REPO)) {
    await createRepo(octo, ORGANIZATION, REPO);
  }
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const workspacePath = __dirname;
  console.log("PATH", workspacePath);
  await uploadToRepo(octo, workspacePath, ORGANIZATION, REPO, BRANCH);

  console.log("Pushed commit");
};

// createInOrg or createForAuthenticatedUser
const createRepo = async (octo, org, name) => {
  await octo.rest.repos.createInOrg({ org, name, auto_init: true });
};

const uploadToRepo = async (octo, coursePath, org, repo, branch) => {
  // gets commit's AND its tree's SHA
  const currentCommit = await getCurrentCommit(octo, org, repo, branch);
  const filesPaths = await globby(["*", ".*"], {
    cwd: coursePath,
    gitignore: true,
  });
  const filesBlobs = await Promise.all(
    filesPaths.map(createBlobForFile(octo, org, repo))
  );
  const pathsForBlobs = filesPaths.map((fullPath) =>
    path.relative(coursePath, fullPath)
  );
  const newTree = await createNewTree(
    octo,
    org,
    repo,
    filesBlobs,
    pathsForBlobs,
    currentCommit.treeSha
  );
  const newCommit = await createNewCommit(
    octo,
    org,
    repo,
    COMMIT_MESSAGE,
    newTree.sha,
    currentCommit.commitSha
  );
  await setBranchToCommit(octo, org, repo, branch, newCommit.sha);
};

const getCurrentCommit = async (octo, org, repo, branch) => {
  const { data: refData } = await octo.rest.git.getRef({
    owner: org,
    repo,
    ref: `heads/${branch}`,
  });
  const commitSha = refData.object.sha;
  const { data: commitData } = await octo.rest.git.getCommit({
    owner: org,
    repo,
    commit_sha: commitSha,
  });
  return {
    commitSha,
    treeSha: commitData.tree.sha,
  };
};

// Notice that readFile's utf8 is typed differently from Github's utf-8
const getFileAsUTF8 = (filePath) => readFile(filePath, "utf8");

const createBlobForFile = (octo, org, repo) => async (filePath) => {
  const content = await getFileAsUTF8(filePath);
  const blobData = await octo.rest.git.createBlob({
    owner: org,
    repo,
    content,
    encoding: "utf-8",
  });
  return blobData.data;
};

const createNewTree = async (
  octo,
  owner,
  repo,
  blobs,
  paths,
  parentTreeSha
) => {
  // My custom config. Could be taken as parameters
  const tree = blobs.map(({ sha }, index) => ({
    path: paths[index],
    mode: `100644`,
    type: `blob`,
    sha,
  }));
  console.log(tree);
  const { data } = await octo.rest.git.createTree({
    owner,
    repo,
    tree,
    base_tree: parentTreeSha,
  });
  console.log(data);
  return data;
};

const createNewCommit = async (
  octo,
  org,
  repo,
  message,
  currentTreeSha,
  currentCommitSha
) =>
  (
    await octo.rest.git.createCommit({
      owner: org,
      repo,
      message,
      tree: currentTreeSha,
      parents: [currentCommitSha],
    })
  ).data;

const setBranchToCommit = (octo, org, repo, branch, commitSha) =>
  octo.rest.git.updateRef({
    owner: org,
    repo,
    ref: `heads/${branch}`,
    sha: commitSha,
  });

main();
