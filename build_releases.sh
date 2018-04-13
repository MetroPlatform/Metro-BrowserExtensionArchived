# Overview:
#   This is a bash script which will package the code and manifests into
#   a chrome version and a firefox version ready for install in the release
#   directory.
# Usage:
#   chmod +x build_releases.sh before running for the first time. You should
#   run this script from the root directory (i.e. the directory this script is
#   in).
#
#   Then to run just ./build_releases.sh

# Zip the Chrome extension:
mkdir chrome_tmp
cp -R assets chrome_tmp
cp -R src chrome_tmp
cp chrome_manifest.json chrome_tmp/manifest.json

cd chrome_tmp
zip -qr ../release/metro_chrome_extension.zip *
cd ../

rm -fr chrome_tmp
