// Capacitor regenerates ios/App/CapApp-SPM/Package.swift on every `cap sync`
// and writes `.iOS(.v26)`, but swift-tools-version 5.9 has no `.v26` enum case,
// so SwiftPM fails to resolve. The string form `.iOS("26.0")` is valid at 5.9
// and keeps the iOS 26 deployment floor. Re-apply it after each sync.
import { readFileSync, writeFileSync } from 'node:fs';

const path = new URL('../ios/App/CapApp-SPM/Package.swift', import.meta.url);
try {
  const src = readFileSync(path, 'utf8');
  const fixed = src.replace(/\.iOS\(\.v26\)/g, '.iOS("26.0")');
  if (fixed !== src) { writeFileSync(path, fixed); console.log('fix-ios-package: patched .v26 → "26.0"'); }
  else console.log('fix-ios-package: nothing to patch');
} catch (e) {
  console.log('fix-ios-package: skipped (' + e.message + ')');
}
