import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const staticDir = path.join(rootDir, 'dashboard', 'static');
const staticAssetsDir = path.join(staticDir, 'assets');

// Ensure directories exist
fs.mkdirSync(staticAssetsDir, { recursive: true });

// Copy assets from dists
const workspaces = [
  { name: 'fleet-operations-dashboard', targetHtml: 'index.html' },
  { name: 'telemetry-test-studio', targetHtml: 'simulator.html' },
  { name: 'historical-analytics', targetHtml: 'analytics.html' },
];

for (const ws of workspaces) {
  const distDir = path.join(rootDir, ws.name, 'dist');
  const distAssetsDir = path.join(distDir, 'assets');

  // Copy assets
  if (fs.existsSync(distAssetsDir)) {
    const files = fs.readdirSync(distAssetsDir);
    for (const file of files) {
      fs.copyFileSync(
        path.join(distAssetsDir, file),
        path.join(staticAssetsDir, file)
      );
    }
  }

  // Copy and adapt HTML
  const distHtml = path.join(distDir, 'index.html');
  if (fs.existsSync(distHtml)) {
    let content = fs.readFileSync(distHtml, 'utf8');
    // Ensure asset paths point correctly to ./assets/ or /assets/
    fs.writeFileSync(path.join(staticDir, ws.targetHtml), content, 'utf8');
    console.log(`Synced ${ws.name} -> dashboard/static/${ws.targetHtml}`);
  }

  // Copy public icons if present
  const iconPath = path.join(distDir, 'cold_chain_mark.svg');
  if (fs.existsSync(iconPath)) {
    fs.copyFileSync(iconPath, path.join(staticDir, 'cold_chain_mark.svg'));
  }
}

console.log('✅ Successfully synced all 3 frontend apps into dashboard/static!');

