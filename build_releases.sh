# Overview:
#   This is a bash script which will package the code and manifests into
#   a chrome version and a firefox version ready for install in the release
#   directory.

# Usage:
#   chmod +x build_releases.sh before running for the first time. You should
#   run this script from the root directory (i.e. the directory this script is
#   in). To sign the firefox extension you need to have the relevant
#   environment variables and have web-ext installed. See
#   https://github.com/mozilla/web-ext for instillation instructions.
#
#   To run just ./build_releases.sh

# Zip the Chrome extension:
mkdir chrome_tmp
cp -R assets chrome_tmp
cp -R src chrome_tmp
cp chrome_manifest.json chrome_tmp/manifest.json

cd chrome_tmp
zip -qr ../release/metro_chrome_extension.zip *
cd ../

rm -fr chrome_tmp

# Zip the Firefox extension:
mkdir firefox_tmp
cp -R assets firefox_tmp
cp -R src firefox_tmp
cp firefox_manifest.json firefox_tmp/manifest.json

cd firefox_tmp
web-ext sign --api-key=$AMO_JWT_ISSUER --api-secret=$AMO_JWT_SECRET
cp web-ext-artifacts/* ../release/
cd ../

rm -fr firefox_tmp
