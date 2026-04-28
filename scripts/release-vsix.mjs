import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const tag = `v${pkg.version}`;
const vsix = path.join(root, `${pkg.name}-${pkg.version}.vsix`);

run("npm", ["run", "package:vsix"]);

if (!existsSync(vsix)) {
	throw new Error(`VSIX not found: ${vsix}`);
}

ensureGh();

const notes = releaseNotes(tag);
const hasRelease = commandSucceeds("gh", ["release", "view", tag]);

if (!hasRelease) {
	run("gh", [
		"release",
		"create",
		tag,
		vsix,
		"--title",
		`${pkg.displayName ?? pkg.name} ${tag}`,
		"--notes",
		notes
	]);
} else {
	run("gh", ["release", "upload", tag, vsix, "--clobber"]);
}

console.log(`Published ${path.basename(vsix)} to GitHub Release ${tag}.`);

function run(command, args) {
	execFileSync(command, args, { stdio: "inherit", shell: process.platform === "win32" });
}

function commandSucceeds(command, args) {
	try {
		execFileSync(command, args, { stdio: "ignore", shell: process.platform === "win32" });
		return true;
	} catch {
		return false;
	}
}

function ensureGh() {
	if (!commandSucceeds("gh", ["--version"])) {
		throw new Error("GitHub CLI is required. Install gh and run `gh auth login` first.");
	}
	if (!commandSucceeds("gh", ["auth", "status"])) {
		throw new Error("GitHub CLI is not authenticated. Run `gh auth login` first.");
	}
}

function releaseNotes(currentTag) {
	const changelogPath = path.join(root, "CHANGELOG.md");
	if (!existsSync(changelogPath)) {
		return fallbackNotes(currentTag);
	}

	const changelog = readFileSync(changelogPath, "utf8");
	const versionHeading = new RegExp(`^## \\[?${escapeRegExp(pkg.version)}\\]?.*$`, "m");
	const match = changelog.match(versionHeading);
	if (!match || match.index === undefined) {
		return fallbackNotes(currentTag);
	}

	const start = match.index + match[0].length;
	const rest = changelog.slice(start);
	const next = rest.search(/^## /m);
	const section = (next >= 0 ? rest.slice(0, next) : rest).trim();
	return section || fallbackNotes(currentTag);
}

function fallbackNotes(currentTag) {
	return [
		`# ${pkg.displayName ?? pkg.name} ${currentTag}`,
		"",
		"Packaged VSIX release.",
		"",
		"## Install",
		"",
		"Download the `.vsix` asset and run:",
		"",
		"```bash",
		`code --install-extension ${pkg.name}-${pkg.version}.vsix --force`,
		"```"
	].join("\n");
}

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
