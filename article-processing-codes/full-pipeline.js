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

// Load reference data for 2020 and 2017
var ref_2020 = ee.FeatureCollection("users/veronikaa307/2020_new"),
    ref_2017 = ee.FeatureCollection("users/veronikaa307/refpoints_2017");

// Set which reference dataset to use. Uncomment to use reference set for 2017
var refPoint = ref_2020;
// var refPoint = ref_2017;

// Select your region of interest for the analysis
// Select one of European Union's countries. Use names based on the LSIB database.
var selected_area = 'Slovakia';

// Select the year for the analysis
var year = 2019;

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
                .filterDate(year+"-04-20",year+"-10-10")                                // filter by date
                .filterMetadata("CLOUDY_PIXEL_PERCENTAGE", "less_than", cloud_cover)  // filter by cloud cover
                .select(selected_bands)                                               // add only selected bands
                .map(addNDVI)                                                         // add NDVI

// Print which images were used
print(collection, "Used Sentinel-2 image collection to create the median composite");

// Create the median composite and add SRTM data
collection = collection.median()    // create median composite
                .addBands(SRTM);    // add SRTM


//S2 RGB

var visParamsTrue = {bands:['B4','B3','B2'], min: 0, max: 3000, gamma: 1.4};

// Map.addLayer 
// ( collection.clip(study_area), visParamsTrue,'Sentinel RGB');

//S2 CIR

var visParamsTrue = {bands:['B8','B4','B3'], min: 0, max: 3000, gamma: 1.4};

// Map.addLayer 
// ( collection.clip(study_area), visParamsTrue,'Sentinel CIR');


//create training data

var gfc = ee.Image("UMD/hansen/global_forest_change_2022_v1_10"),
    CORINE = ee.Image("COPERNICUS/CORINE/V20/100m/2018").select('landcover');
// print(CORINE)


// Create a forest mask for data
// Select pixels with >50% tree cover and mask out region with forest loss
var GFC = gfc.select("treecover2000").updateMask(gfc.select("treecover2000").gte(50));

// Hansen Global forest - Select areas with forest loss from 2000 till 2020
var maskedLoss = (gfc.select('lossyear').unmask().lt(1)).or(gfc.select('lossyear').unmask().gt(ee.Number(year).subtract(ee.Number(2000))));

var maskedGFC = GFC.updateMask(maskedLoss);

// Load the Copernicus Global Land Cover Layers and use only the selected land cover type
var CORINE_forests = CORINE.updateMask(CORINE.eq(312).or(CORINE.eq(311)).or(CORINE.eq(313)));

//print (CORINE_forests);

// Create an intersection of these two land cover databases
var CORINEAndHansen = CORINE_forests.updateMask(maskedGFC.select('treecover2000')).unmask();

// Create an intersection of these two land cover databases
var CORINEAndHansenBinary = CORINEAndHansen.gt(0);

//Map.addLayer(CORINEAndHansen, null, 's unmask');
//Map.addLayer(CORINE_forests.updateMask(maskedGFC.select('treecover2000')), null, 'bez unmask');
// Map.addLayer(gfc, null, 'Hansen all');
// Map.addLayer(GFC, null, '50% forest Hansen');
// Map.addLayer(gfc.select('lossyear'), null, 'all loss');
//Map.addLayer(maskedLoss, null, 'maskedLoss');
// Map.addLayer(maskedGFC, null, 'maskedGFC');
// Map.addLayer(CORINE, {}, 'CORINE all');
//Map.addLayer(CORINE_forests, null, 'CORINE_forests');
//Map.addLayer(CORINEAndHansen, null, 'FINAL CORINEAndHansen forest mask');
// Map.addLayer(CORINEAndHansenBinary, null, 'FINAL CORINEAndHansenBinary');


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
      inputProperties: ['B2','B3','B4', 'B5', 'B6', 'B8', 'B11', 'B12', 'NDVI', 'SRTM']
    });
    

// Classify the input imagery.
var classified_RF = input.classify(classifier_RF);

// Define a palette for the IGBP classification.
var igbpPalette = [
 '#FFFFFF',  // non-forest
  '#30eb5b', // forest
 ];

// Display the input and the classification.
//Map.centerObject(study_area, 10);
// Map.addLayer(classified_RF, {palette: igbpPalette, min: 0, max: 1}, 'classification RF');

var forest_Palette = [
  '#30eb5b', // forest
  ];

// Load only forest
var RF_forests = classified_RF.updateMask(classified_RF.eq(1));
// Map.addLayer(RF_forests, {palette: forest_Palette}, ' RF forest');



////////////AccuraAccuracy Assessment/////////////////////

// Map.addLayer(refPoint,{color:'green'}, 'ref_point_2020');
//Map.addLayer(refPoint,{color:'green'}, 'ref_point_2017');

// print (refPoint)

// Accuracy Assessment
var AA_RF = classified_RF.reduceRegions({
  collection: refPoint,
  reducer: ee.Reducer.median(),
  scale: set_scale
});
// print(AA_RF, "points")

var testAccuracy_RF= AA_RF.errorMatrix('kontrola', 'median');
print('Validation_RF', testAccuracy_RF.accuracy());
print('Validation matrix_RF: ', testAccuracy_RF);
print('Kappa index_RF: ', testAccuracy_RF.kappa());
print('Producers Accuracy_RF: ', testAccuracy_RF.producersAccuracy());
print('Consumers Accuracy_RF: ', testAccuracy_RF.consumersAccuracy());

///////////////////////SVM////////////////////////////////////////////////////////////

// Make a SVM classifier and train it.
var classifier_SVM = ee.Classifier.libsvm()
    .train({
      features: training,
      classProperty: 'landcover',
      inputProperties: ['B2','B3','B4', 'B5', 'B6', 'B8', 'B11', 'B12', 'NDVI', 'SRTM']
    });
    


// Classify the input imagery.
var classified_SVM = input.classify(classifier_SVM );


// Define a palette for the IGBP classification.
var igbpPalette = [
 '#FFFFFF',  // non-forest
  '#30eb5b', // forest
 
];

// Display the input and the classification.
//Map.centerObject(study_area, 10);
// Map.addLayer(classified_SVM, {palette: igbpPalette, min: 0, max: 1}, 'classification_SVM');


var forest_Palette = [
  '#30eb5b', // forest
  ];

// Load only forest
var SVM_forests = classified_SVM.updateMask(classified_SVM.eq(1));
Map.addLayer(SVM_forests, {palette: forest_Palette}, 'SVM classification forests');


// Accuracy Assessment
var AA_SVM = classified_SVM.reduceRegions({
  collection: refPoint,
  reducer: ee.Reducer.median(),
  scale: set_scale
});

var testAccuracy_SVM= AA_SVM.errorMatrix('kontrola', 'median');
print('Validation SVM', testAccuracy_SVM.accuracy());
print('Validation matrixSVM: ', testAccuracy_SVM);
print('Kappa index SVM: ', testAccuracy_SVM.kappa());
print('Producers Accuracy_SVM: ', testAccuracy_SVM.producersAccuracy());
print('Consumers Accuracy_SVM: ', testAccuracy_SVM.consumersAccuracy());



//#####################################CALCULATE SELECTED AREA######################################################

//Calculate area in ha
var img10 = ee.Image.pixelArea().divide(10000);
var area = study_area;
var scaleforTestArea = set_scale;

var uzemie_area = img10.reduceRegion({
  reducer: ee.Reducer.sum(),
  geometry: area,
  //crs: 'WGS Zone N 34',
  scale: scaleforTestArea,
  maxPixels: 1E13
});
//gives an area of
// print('Rozloha vybraného územia: ', ee.Number(uzemie_area.get('area')).getInfo() + 'ha');

//Calculate area of forest  in ha

// Load only forest
var forest_Palette = [
  '#30eb5b', // forest
  ];

var RF_forests = classified_RF.updateMask(classified_RF.eq(1));
Map.addLayer(RF_forests, {palette: forest_Palette}, 'RF classification forests');



//Calculate forest in ha from RF
var RF_forests2 = RF_forests.multiply(ee.Image.pixelArea().divide(10000));
var stats = RF_forests2.reduceRegion({
  reducer: ee.Reducer.sum(),
  geometry: area,
  //crs: 'WGS Zone N 34',
  scale: scaleforTestArea,
  maxPixels: 1E13,
   tileScale :16
});
print('orest area based on RF in ha', stats);

Export.table.toDrive({
  collection: ee.FeatureCollection([
    ee.Feature(null, stats)
  ]),
  description: 'SR_2020',
  fileFormat: 'CSV'
});

//Calculate forest in ha from SVM
var SVM_forests2 = SVM_forests.multiply(ee.Image.pixelArea().divide(10000));
var stats = SVM_forests2.reduceRegion({
  reducer: ee.Reducer.sum(),
  geometry: area,
  //crs: 'WGS Zone N 34',
  scale: scaleforTestArea,
  maxPixels: 1E13
});
print('Forest area based on SVM in ha', stats);


//CLC FORESTS (ha)
var CORINE = ee.Image("COPERNICUS/CORINE/V20/100m/2018").select('landcover');
var CORINE_forests = CORINE.updateMask(CORINE.eq(312).or(CORINE.eq(311)).or(CORINE.eq(313))).unmask();
var CORINE_forestsBinary = CORINE_forests.gt(0);
var CLC_forests = CORINE_forestsBinary.updateMask(CORINE_forestsBinary.eq(1));
//Map.addLayer(CLC_forests,null, 'CLC_forests');

var forest_Palette_clc = [
  '27601C', // forest
  ];

var CORINEClip = CLC_forests.clip(study_area);
// Map.addLayer(CORINEClip, {palette: forest_Palette_clc}, 'CORINEClip_SR');


var CORINE_forests2 = CORINEClip.multiply(ee.Image.pixelArea().divide(10000));
var stats = CORINE_forests2.reduceRegion({
 reducer: ee.Reducer.sum(),
 geometry: study_area,
                               //crs: 'WGS Zone N 34',
 scale: 100,
  maxPixels: 1E13
});

// print('Rozloha CLC lesa v ha', stats);


//###################################EXPORT########################################################

// // Export classified  RF map to Google Drive
 Export.image.toDrive({
   image: classified_RF,
  description: 'Sentinel_Classified_RF_'+year,
  scale: set_scale,
  region: study_area,
   maxPixels: 1e13
 });

//###########################################################################################
// // Export classified  SVM map to Google Drive
 Export.image.toDrive({
   image: classified_SVM,
  description: 'Sentinel_Classified_SVM_'+year,
  scale: set_scale,
  region: study_area,
   maxPixels: 1e13,
 });
//###################################################################################
// Export classified  CORINE forest map to Google Drive
Export.image.toDrive({
  image: CORINE_forests2,
  description: 'Corine_forests_2018',
  scale: 100,
  region: study_area,
  maxPixels: 1e13,
});
 
