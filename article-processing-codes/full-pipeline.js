var ref_2020 = ee.FeatureCollection("users/veronikaa307/2020_new"),
    ref_2017 = ee.FeatureCollection("users/veronikaa307/refpoints_2017"),
    ref_unsup_2020 = ee.FeatureCollection("users/veronikaa307/2020_unsup"),
    ref_unsup_2017 = ee.FeatureCollection("users/veronikaa307/2017_unsup"),
    imageCollection = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED");

var countries = ee.FeatureCollection('USDOS/LSIB_SIMPLE/2017');
var study_area = countries.filter(ee.Filter.eq('country_na', 'Slovakia')); //analysis for Slovakia
//var study_area = ee.FeatureCollection('FAO/GAUL/2015/level2').filterMetadata('ADM1_NAME', 'equals', 'Kosice'); //analysis for NUTS III
//var study_area = ee.FeatureCollection('FAO/GAUL/2015/level2').filterMetadata('ADM2_NAME', 'equals', 'Brezno'); //analysis for NUTS IV
Map.addLayer(study_area, {}, 'Slovakia', false);
Map.centerObject(study_area, 8);



var addNDVI = function(img) {
  
  var ndvi = img.normalizedDifference(['B8', 'B4']).rename('NDVI');
  
  return img.addBands(ndvi);
};

var SRTM = ee.Image("CGIAR/SRTM90_V4").rename('SRTM');


var collection = ee.ImageCollection("COPERNICUS/S2_SR")
                .filterBounds(study_area)
                .filterDate("2017-04-20","2017-10-10")
                .filterMetadata("CLOUDY_PIXEL_PERCENTAGE", "less_than", 5)
                .select(['B2','B3','B4', 'B5', 'B6', 'B8', 'B11', 'B12'])
                .map(addNDVI)
                .median()
                .addBands(SRTM);

print(collection, "Sentinel-2 image collection");


//S2 RGB

var visParamsTrue = {bands:['B4','B3','B2'], min: 0, max: 3000, gamma: 1.4};

Map.addLayer 
( collection.clip(study_area), visParamsTrue,'Sentinel RGB');

//S2 CIR

var visParamsTrue = {bands:['B8','B4','B3'], min: 0, max: 3000, gamma: 1.4};

Map.addLayer 
( collection.clip(study_area), visParamsTrue,'Sentinel CIR');


//create training data

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
  numPixels: 2000,
  seed: 0,
  scale: 30,
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
Map.addLayer(classified_RF, {palette: igbpPalette, min: 0, max: 1}, 'classification RF');

var forest_Palette = [
  '#30eb5b', // forest
  ];

// Load only forest
var RF_forests = classified_RF.updateMask(classified_RF.eq(1));
Map.addLayer(RF_forests, {palette: forest_Palette}, ' RF forest');



////////////AccuraAccuracy Assessment/////////////////////

//var refPoint = ref_2020;
var refPoint = ref_2017;

Map.addLayer(refPoint,{color:'green'}, 'ref_point_2020');
//Map.addLayer(refPoint,{color:'green'}, 'ref_point_2017');

print (refPoint)

// Accuracy Assessment
var AA_RF = classified_RF.reduceRegions({
  collection: refPoint,
  reducer: ee.Reducer.median(),
  scale: 10
});
print(AA_RF, "points")

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
Map.addLayer(classified_SVM, {palette: igbpPalette, min: 0, max: 1}, 'classification_SVM');


var forest_Palette = [
  '#30eb5b', // forest
  ];

// Load only forest
var SVM_forests = classified_SVM.updateMask(classified_SVM.eq(1));
Map.addLayer(SVM_forests, {palette: forest_Palette}, ' SVM forest');


// Accuracy Assessment
var AA_SVM = classified_SVM.reduceRegions({
  collection: refPoint,
  reducer: ee.Reducer.median(),
  scale: 10
});

var testAccuracy_SVM= AA_SVM.errorMatrix('kontrola', 'median');
print('Validation SVM', testAccuracy_SVM.accuracy());
print('Validation matrixSVM: ', testAccuracy_SVM);
print('Kappa index SVM: ', testAccuracy_SVM.kappa());
print('Producers Accuracy_SVM: ', testAccuracy_SVM.producersAccuracy());
print('Consumers Accuracy_SVM: ', testAccuracy_SVM.consumersAccuracy());


//############################UNSUPERVISED####################################################### 

 // Make the training dataset.
var training = input.sample({
  region: study_area,
  scale: 10,
  numPixels: 2000
});

// Instantiate the clusterer and train it.
var clusterer = ee.Clusterer.wekaKMeans(2).train(training);

// Cluster the input using the trained clusterer.
var UNSUPERVISED = input.cluster(clusterer);

// Display the clusters with random colors.
Map.addLayer(UNSUPERVISED.randomVisualizer(), {}, 'Unsupervised classification');


// Load only forest
var forest_Palette = [
  '#27601C', // forest
  ];
  
//select only forest from unsupervised classification

var UNSUPERVISED_forests = UNSUPERVISED.updateMask(UNSUPERVISED.eq(0));
Map.addLayer(UNSUPERVISED_forests, {palette: forest_Palette}, ' Unsupervised_forests');


////////////AccuraAccuracy Assessment UNSUPERVISED/////////////////////

var refPoint_unsup = ref_unsup_2017;
//var refPoint_unsup = ref_unsup_2020;

var AA_UNSUPERVISED = UNSUPERVISED.reduceRegions({
  collection: refPoint_unsup,
  reducer: ee.Reducer.median(),
  scale: 10
});
print(AA_UNSUPERVISED, "points")

var testAccuracy_UNSUPERVISED= AA_UNSUPERVISED.errorMatrix('kontrola', 'median');
print('Validation_UNSUPERVISED', testAccuracy_UNSUPERVISED.accuracy());
print('Validation matrix_UNSUPERVISED: ', testAccuracy_UNSUPERVISED);
print('Kappa index_UNSUPERVISED: ', testAccuracy_UNSUPERVISED.kappa());
print('Producers Accuracy_UNSUPERVISED: ', testAccuracy_UNSUPERVISED.producersAccuracy());
print('Consumers Accuracy_UNSUPERVISED: ', testAccuracy_UNSUPERVISED.consumersAccuracy());



//#####################################CALCULATE SELECTED AREA######################################################

//Calculate area in ha
var img10 = ee.Image.pixelArea().divide(10000);
var area = study_area;
var scaleforTestArea = 30;

var uzemie_area = img10.reduceRegion({
  reducer: ee.Reducer.sum(),
  geometry: area,
  //crs: 'WGS Zone N 34',
  scale: scaleforTestArea,
  maxPixels: 1E13
});
//gives an area of
print('Rozloha vybraného územia: ', ee.Number(uzemie_area.get('area')).getInfo() + 'ha');

//Calculate area of forest  in ha

// Load only forest
var forest_Palette = [
  '#30eb5b', // forest
  ];

var RF_forests = classified_RF.updateMask(classified_RF.eq(1));
Map.addLayer(RF_forests, {palette: forest_Palette}, ' RF forest');


//Calculate forest in ha from RF
var RF_forests2 = RF_forests.multiply(ee.Image.pixelArea().divide(10000));
var stats = RF_forests2.reduceRegion({
  reducer: ee.Reducer.sum(),
  geometry: area,
  //crs: 'WGS Zone N 34',
  scale: scaleforTestArea,
  maxPixels: 1E13
});
print('Rozloha lesa podľa RF v ha', stats);

//Calculate forest in ha from SVM
var SVM_forests2 = SVM_forests.multiply(ee.Image.pixelArea().divide(10000));
var stats = SVM_forests2.reduceRegion({
  reducer: ee.Reducer.sum(),
  geometry: area,
  //crs: 'WGS Zone N 34',
  scale: scaleforTestArea,
  maxPixels: 1E13
});
print('Rozloha lesa podľa SVM v ha', stats);

//Calculate forest in ha from UNSUPERVISED CLASSIFICATION
var neles_unsup = UNSUPERVISED.updateMask(UNSUPERVISED.eq(1));
var UNSUPERVISED_neles = neles_unsup.multiply(ee.Image.pixelArea().divide(10000));

var neles_unsup_stats = UNSUPERVISED_neles.reduceRegion({
  reducer: ee.Reducer.sum(),
  geometry: area,
  //crs: 'WGS Zone N 34',
   scale: 10,
  maxPixels: 1E13
});

print('Rozloha lesa neriadenej klas. v ha', ee.Number(uzemie_area.get('area')).subtract(ee.Number(neles_unsup_stats.get('cluster'))));

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
Map.addLayer(CORINEClip, {palette: forest_Palette_clc}, 'CORINEClip_SR');


var CORINE_forests2 = CORINEClip.multiply(ee.Image.pixelArea().divide(10000));
var stats = CORINE_forests2.reduceRegion({
 reducer: ee.Reducer.sum(),
 geometry: study_area,
                               //crs: 'WGS Zone N 34',
 scale: 30,
  maxPixels: 1E13
});

print('Rozloha CLC lesa v ha', stats);


//###################################EXPORT########################################################

// // Export classified  RF map to Google Drive
 Export.image.toDrive({
   image: classified_RF,
  description: 'Sentinel_Classified_RF_2020',
  scale: 10,
  region: study_area,
   maxPixels: 1e13,
 });

//###########################################################################################
// // Export classified  SVM map to Google Drive
 Export.image.toDrive({
   image: classified_SVM,
  description: 'Sentinel_Classified_SVM_2020',
  scale: 10,
  region: study_area,
   maxPixels: 1e13,
 });
//###################################################################################
// // Export classified  CORINE forest map to Google Drive
 Export.image.toDrive({
   image: CORINE_forests2,
  description: 'Corine_forests',
  scale: 30,
  region: study_area,
   maxPixels: 1e13,
 });
 
//###################################################################################
// // Export classified  UNSUPERVISED forest map to Google Drive
 Export.image.toDrive({
   image: UNSUPERVISED,
  description: 'UNSUPERVISED_forests_2020',
  scale: 10,
  region: study_area,
   maxPixels: 1e13,
 });



//################################INDECIES###################################################

var countries = ee.FeatureCollection('USDOS/LSIB_SIMPLE/2017');
var study_area = ee.FeatureCollection('FAO/GAUL/2015/level2').filterMetadata('ADM2_NAME', 'equals', 'Kosice-okolie'); //analýza pre okres
  Map.addLayer(study_area, {}, 'Kosice-okolie', false);
Map.centerObject(study_area, 8);

var S2 = imageCollection
  .filterMetadata('CLOUDY_PIXEL_PERCENTAGE','less_than', 5)
  .filterDate('2020-01-01', '2020-12-30') 
  .filterBounds(study_area); //Kosice-okolie
  
//NDVI
var addNDVI = function(image){
  return image.addBands(image.normalizedDifference(['B8','B4']).rename("ndvi"));
};

var S2 = S2.map(addNDVI);
print(S2);


// Plot results
var plotNDVI = ui.Chart.image.seriesByRegion(
  S2, 
  study_area,
  ee.Reducer.mean(),
  'ndvi',10)
  .setChartType('LineChart')
  .setSeriesNames(['NDVI'])
  .setOptions({
    interpolateNulls: true,
    lineWidth: 1,
    pointSize: 3,
    title: 'NDVI',
    hAxis: {title: 'Date'},
    vAxis: {title: 'NDVI'},
    series: {0:{color: 'green'}}
  });
  
print(plotNDVI);


// Extract NDVI band from S2 collection 
var NDVI = S2.select(['ndvi']);
// Extract median NDVI value for each pixel
var NDVImed = NDVI.median(); 



 var palNDVI =  ['#a50026','#d73027', '#f46d43','#fdae61',  '#66bd63', '	#006837', ]; 
 Map.addLayer(
 NDVImed.clip(study_area),                          // Clip map to plot borders
 {min: -1, max: 1, palette: palNDVI},  // Specify color palette 
 'NDVI'                                          // Layer name
  )


//NDMI

var addNDMI = function(image){
  return image.addBands(image.normalizedDifference(['B8','B11']).rename("ndmi"));
};

var S2 = S2.map(addNDMI);
print(S2);


// Plot results
var plotNDMI = ui.Chart.image.seriesByRegion(
  S2, 
  study_area,
  ee.Reducer.mean(),
  'ndmi',10)
  .setChartType('LineChart')
  .setSeriesNames(['NDMI'])
  .setOptions({
    interpolateNulls: true,
    lineWidth: 1,
    pointSize: 3,
    title: 'NDMI',
    hAxis: {title: 'Date'},
    vAxis: {title: 'NDMI'},
    series: {0:{color: 'blue'}}
  });
  
print(plotNDMI);


// Extract NDVI band from S2 collection 
var NDMI = S2.select(['ndmi']);
// Extract median NDVI value for each pixel
var NDMImed = NDMI.median(); 



 var palNDMI =  ['#0C0A92','#153C9B','#2792D7', '#43DCF4','#CEFD61',  '#DFFEC8', '#0CA70A', '#066205']; 
 Map.addLayer(
 NDMImed.clip(study_area),                          // Clip map to plot borders
 {min: -1, max: 1, palette: palNDMI},  // Specify color palette 
 'NDMI'                                          // Layer name
  )
 
  
//GNDVI  

var addGNDVI = function(image){
  return image.addBands(image.normalizedDifference(['B8','B3']).rename("gndvi"));
};

var S2 = S2.map(addGNDVI);
print(S2);


// Plot results
var plotGNDVI = ui.Chart.image.seriesByRegion(
  S2, 
  study_area,
  ee.Reducer.mean(),
  'gndvi',10)
  .setChartType('LineChart')
  .setSeriesNames(['GNDVI'])
  .setOptions({
    interpolateNulls: true,
    lineWidth: 1,
    pointSize: 3,
    title: 'GNDVI',
    hAxis: {title: 'Date'},
    vAxis: {title: 'GNDVI'},
    series: {0:{color: 'red'}}
  });
  
print(plotGNDVI);


// Extract NDVI band from S2 collection 
var GNDVI = S2.select(['gndvi']);
// Extract median NDVI value for each pixel
var GNDVImed = GNDVI.median(); 



 var palGNDVI =  ['#a50026','#d73027', '#f46d43','#fdae61',  '#66bd63', '	#006837', ]; 
 Map.addLayer(
 GNDVImed.clip(study_area),                          // Clip map to plot borders
 {min: -1, max: 1, palette: palGNDVI},  // Specify color palette 
 'GNDVI'                                          // Layer name
  )
