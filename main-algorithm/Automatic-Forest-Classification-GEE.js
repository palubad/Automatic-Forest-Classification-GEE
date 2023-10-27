/*
Authors of the code: Krištofová, V., Paluba, D., Onačillová, K.
(For more info contact: katarina.onacillova@upjs.sk)

This code is free and open. 
By using this code and any data derived with it, 
you agree to cite the following reference 
in any publications derived from them:
 
    Krištofová, V., Onačillová, K., Paluba, D. 2023: 
    Automatická klasifikácia lesnej pokrývky pomocou multispektrálnych satelitných dát 
    družice Sentinel-2 a metód strojového učenia v Google Earth Engine.

###########################################################################################################
*/

// ===================================================================================================== //
// ===================================== USER INTERFACE ================================================ //
// ===================================================================================================== //

// Select your region of interest for the analysis
// Select one of European Union's countries. Use names based on the LSIB database.
var selected_area = 'Slovakia';

// Select the year for the analysis
var year = 2019;

// Select the start and end month to include in the analysis <start_month, end_month>
// Each day of both the start and end months will be included in the analysis
var start_month = 4;
var end_month = 10;

// Set the maximum allowed cloud cover
var cloud_cover = 5;

// Set the number of training points
var num_traning_points = 2000;

// Set the scale (spatial resolution in meters)
var set_scale = 30;

// Here are examples of selecting NUTS3 or NUTS4 regions as study area
// It is possible to use lower NUTS divisions of countries, e.g. NUTS3, NUTS4, etc.
// var selected_area = ee.FeatureCollection('FAO/GAUL/2015/level2').filterMetadata('ADM1_NAME', 'equals', 'Kosice'); //analysis for NUTS III
// var selected_area = ee.FeatureCollection('FAO/GAUL/2015/level2').filterMetadata('ADM2_NAME', 'equals', 'Brezno'); //analysis for NUTS IV


// If you want to use your own geometry, please name it geometry like in the following 
// example and uncomment geometry variable
// var geometry = ee.Geometry.Polygon(
//         [[[21.250706032889756, 48.76271940277512],
//           [21.250706032889756, 48.61857924625227],
//           [21.61462815203038, 48.61857924625227],
//           [21.61462815203038, 48.76271940277512]]], null, false);



// ########################################################################################################
// ===================================================================================================== //
// ============================= SETTINGS FOR ADVANCED USERS OF GEE ==================================== //
// ===================================================================================================== //

// Load LSIB countries and load the selected one
var countries = ee.FeatureCollection('USDOS/LSIB_SIMPLE/2017');

// The conditions for using LSIB database or own geometry
if (typeof selected_area == 'string') {
  var study_area = countries.filter(ee.Filter.eq('country_na', selected_area));
}
if (typeof geometry == 'object') {
  var study_area = geometry;
}

// Print available countries
print('List of countries in Europe in the LSIB database:',countries.filter(ee.Filter.eq('wld_rgn','Europe')).aggregate_array('country_na'))

// Add the layer to the map and center the view on it
Map.addLayer(study_area, {}, 'Your study area');
Map.centerObject(study_area, 8);

var selected_bands = ['B2','B3','B4', 'B5', 'B6', 'B8', 'B11', 'B12']

// Function to add NDVI vegetation index
var addNDVI = function(img) {
  var ndvi = img.normalizedDifference(['B8', 'B4']).rename('NDVI');
  return img.addBands(ndvi);
};

// Load SRTM elevation data
var SRTM = ee.Image("CGIAR/SRTM90_V4").rename('SRTM');

// Load Sentinel-2 (S2) collection
var imageCollection = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED");

// Filter the collection by date, area, clouds and input bands + add NDVI
var collection = ee.ImageCollection("COPERNICUS/S2_SR")
                .filterBounds(study_area)                                             // spatial filter
                .filter(ee.Filter.calendarRange(year, year, 'year'))                  // filter by year
                .filter(ee.Filter.calendarRange(start_month, end_month, 'month'))     // filter by months
                .filterMetadata("CLOUDY_PIXEL_PERCENTAGE", "less_than", cloud_cover)  // filter by cloud cover
                .select(selected_bands)                                               // add only selected bands
                .map(addNDVI)                                                         // add NDVI

// Print which images were used
print(collection, "Used Sentinel-2 image collection to create the median composite");

// Create the median composite and add SRTM data
collection = collection.median()    // create median composite
                .addBands(SRTM);    // add SRTM

// Add S2 RGB to the map
var visParamsTrue = {bands:['B4','B3','B2'], min: 0, max: 3000, gamma: 1.4};

Map.addLayer(collection.clip(study_area), visParamsTrue,'Sentinel RGB');

// Add S2 CIR to the map
var visParamsTrue = {bands:['B8','B4','B3'], min: 0, max: 3000, gamma: 1.4};
Map.addLayer(collection.clip(study_area), visParamsTrue,'Sentinel CIR');


// ===================================================================================================== //
// ===================================== THE MAIN ANALYSIS ============================================= //
// ===================================================================================================== //

// The intersection of CLC and GFC was adopted from Paluba et al. 2021 and further improved
// Article: https://doi.org/10.3390/rs13091743, Codes: https://github.com/palubad/LC-SLIAC
// Create training data
var gfc = ee.Image("UMD/hansen/global_forest_change_2022_v1_10"),
    CORINE = ee.Image("COPERNICUS/CORINE/V20/100m/2018").select('landcover');
print(CORINE)

// Create a forest mask for data
// Select pixels with >50% tree cover and mask out region with forest loss
var GFC = gfc.select("treecover2000").updateMask(gfc.select("treecover2000").gte(50));

// Hansen Global forest - Select areas with forest loss from 2000 till 2020
var maskedLoss = (gfc.select('lossyear').unmask().lt(1)).or(gfc.select('lossyear').unmask().gt(17));

var maskedGFC = GFC.updateMask(maskedLoss);

// Load the Copernicus Global Land Cover Layers and use only the selected land cover type
var CORINE_forests = CORINE.updateMask(CORINE.eq(312).or(CORINE.eq(311)).or(CORINE.eq(313)));

// Create an intersection of these two land cover databases
var CORINEAndHansen = CORINE_forests.updateMask(maskedGFC.select('treecover2000')).unmask();

// Create an intersection of these two land cover databases
var CORINEAndHansenBinary = CORINEAndHansen.gt(0);

// Add the final intersection of CLC and GFC databases, based on which the training was performed
Map.addLayer(CORINEAndHansenBinary.clip(study_area).updateMask(CORINEAndHansenBinary.clip(study_area).eq(1)), {}, 'CLC&GFC forest mask');

var input = (collection.clip(study_area)) 

// Sample the input imagery to get a FeatureCollection of training data.
var training =  input.addBands(CORINEAndHansenBinary).sample({
  numPixels: num_traning_points,
  seed: 0,
  scale: set_scale,
  region: study_area,
  tileScale: 4
});


// Make a Random Forest classifier and train it.
var classifier_RF = ee.Classifier.smileRandomForest(10)
    .train({
      features: training,
      classProperty: 'landcover',
      inputProperties: selected_bands.concat(['NDVI','SRTM']) // add NDVI and SRTM on top of the selected bands
    });
    

// Classify the input imagery.
var classified_RF = input.classify(classifier_RF);

var forest_Palette = [
  '#30eb5b', // forest
  ];

// Load only forest
var RF_forests = classified_RF.updateMask(classified_RF.eq(1));
Map.addLayer(RF_forests, {palette: forest_Palette}, 'Classified forests in '+year);

// Export classified  RF map to Google Drive
 Export.image.toDrive({
   image: RF_forests,
  description: 'Classified_RF_'+year+'_toGoogleDrive',
  scale: set_scale,
  region: study_area,
   maxPixels: 1e13
 });
 
// Export classified  RF map to Asset
 Export.image.toAsset({
   image: RF_forests,
  description: 'Classified_RF_'+year+'_toAsset',
  scale: set_scale,
  region: study_area,
   maxPixels: 1e13
 });
