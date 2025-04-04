#!/bin/bash

# Create a temporary directory for packaging
TEMP_DIR="ankiaifox_temp"
PACKAGE_NAME="ankiaifox.zip"

# Clean up any existing temporary directory and package
rm -rf "$TEMP_DIR"
rm -f "$PACKAGE_NAME"

# Create temporary directory
mkdir "$TEMP_DIR"

# Copy necessary files
cp manifest.json "$TEMP_DIR/"
cp -r js "$TEMP_DIR/"
cp -r popup "$TEMP_DIR/"
cp -r icons "$TEMP_DIR/"

# Create the ZIP file (using -9 for maximum compression and -X to remove extra attributes)
cd "$TEMP_DIR"
zip -9 -X -r "../$PACKAGE_NAME" *
cd ..

# Clean up temporary directory
rm -rf "$TEMP_DIR"

echo "Extension packaged successfully as $PACKAGE_NAME" 