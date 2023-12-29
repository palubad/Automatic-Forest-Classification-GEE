# Automatic-Forest-Classification-GEE
Supplementary material for the article [Onačillová K., Krištofová V., Paluba D. (2023): Automatic Classification of Forests using Sentinel-2 Multispectral Satellite Data and Machine Learning Methods in Google Earth Engine](http://www.actageographica.sk/stiahnutie/67_2_01_Onacilova_Kristofova_Paluba_final.pdf).

The main objective of this paper was to automatically classify forests using Machine Learning algorithms. In this paper, we developed a tool in Google Earth Engine (GEE) that allows automatic classification of forest cover using Sentinel-2 satellite imagery. The great advantage of the developed tool and the GEE platform is the possibility for users to change the input parameters according to their own requirements and also the possibility to modify parts of the code for their own needs. The developed tool was created using JavaScript using the Code Editor interface in GEE and is available in this GitHub repository.

**How to use the tool:**

In the first step, the user of the tool chooses the area of interest for automatic forest cover classification – the user can select any country or lower administrative unit in the EU from the LSIB 2017 database or create its own area in GEE. As training data are prepared using the CLC database, which only covers EU countries, the selection is limited to EU territory. In the next step, the year of analysis is selected. Currently, the years 2017-2022 can be selected due to the availability of data in the GFC database. The range of months for the input data for the median composite can also be specified. Another advantage of the created tool is the possibility to choose the upper limit of cloud cover for Sentinel-2 scenes and any number of training samples to be used in image classification. Advanced users can also modify other parts of the code, e.g. input bands, spectral indices (e.g. NDVI) and additional inputs to the classification (e.g. SRTM).

In the next parts, the methodology described in this paper is carried out, i.e., automatic creation of training dataset using the intersection of the CLC2018 and GLC databases, supervised classification using RF using the generated training data. The following layers are displayed in the map window: a median composite of the Sentinel-2 time series as an RGB composite, the intersection of the GLC and CLC2018 databases, and the resulting classification for the entire area of interest. The classified result can be exported as a so-called asset to GEE or downloaded as a GeoTiff to Google Disk via the “Tasksˮ tab on the right. 

All the code used in the creation of the paper, including the comparison of classification algorithms, the accuracy evaluation and the validation points used, is also available in this GitHub repository - refer to the folder "article-processing-codes".

**Codes in the GEE Code Editor**

The codes are available from the GEE CodeEditor JavaScript API from [this URL](https://code.earthengine.google.com/c2f07a9161037480b5fbf8f11a6acaf).

**Forest cover layers for Slovakia for 2017-2022**

These classification results are accessible also through the forest cover database created for the entire territory of Slovakia covering all years from 2017 to 2022. The database stored in raster format has a spatial resolution of 30 m and is freely available as a GEE Image Collection and can be imported using the following code:
_ee. ImageCollection('users/danielp/Slovakia_forests_2017-2022')_
