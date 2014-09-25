'use strict';

/*global require,L,URI*/

var CesiumMath = require('../../third_party/cesium/Source/Core/Math');
var clone = require('../../third_party/cesium/Source/Core/clone');
var combine = require('../../third_party/cesium/Source/Core/combine');
var defaultValue = require('../../third_party/cesium/Source/Core/defaultValue');
var defined = require('../../third_party/cesium/Source/Core/defined');
var defineProperties = require('../../third_party/cesium/Source/Core/defineProperties');
var DeveloperError = require('../../third_party/cesium/Source/Core/DeveloperError');
var ImageryLayer = require('../../third_party/cesium/Source/Scene/ImageryLayer');
var knockout = require('../../third_party/cesium/Source/ThirdParty/knockout');
var Rectangle = require('../../third_party/cesium/Source/Core/Rectangle');
var WebMapServiceImageryProvider = require('../../third_party/cesium/Source/Scene/WebMapServiceImageryProvider');

var corsProxy = require('../corsProxy');
var GeoDataSourceViewModel = require('./GeoDataSourceViewModel');
var ImageryLayerDataSourceViewModel = require('./ImageryLayerDataSourceViewModel');
var inherit = require('../inherit');
var rectangleToLatLngBounds = require('../rectangleToLatLngBounds');

/**
 * A {@link ImageryLayerDataSourceViewModel} representing a layer from a Web Map Service (WMS) server.
 *
 * @alias WebMapServiceDataSourceViewModel
 * @constructor
 * @extends ImageryLayerDataSourceViewModel
 * 
 * @param {GeoDataCatalogContext} context The context for the group.
 */
var WebMapServiceDataSourceViewModel = function(context) {
    ImageryLayerDataSourceViewModel.call(this, context, 'wms');

    /**
     * Gets or sets the URL of the WMS server.  This property is observable.
     * @type {String}
     */
    this.url = '';

    /**
     * Gets or sets the WMS layers to include.  To specify multiple layers, separate them
     * with a commas.  This property is observable.
     * @type {String}
     */
    this.layers = '';

    /**
     * Gets or sets the additional parameters to pass to the WMS server when requesting images.
     * @type {Object}
     */
    this.parameters = WebMapServiceDataSourceViewModel.defaultParameters;

    /**
     * Gets or sets a value indicating whether we should request information about individual features on click
     * as GeoJSON.  If getFeatureInfoAsXml is true as well, feature information will be requested first as GeoJSON,
     * and then as XML if the GeoJSON request fails.  If both are false, this data item will not support feature picking at all.
     * @type {Boolean}
     * @default true
     */
    this.getFeatureInfoAsGeoJson = true;

    /**
     * Gets or sets a value indicating whether we should request information about individual features on click
     * as XML.  If getFeatureInfoAsGeoJson is true as well, feature information will be requested first as GeoJSON,
     * and then as XML if the GeoJSON request fails.  If both are false, this data item will not support feature picking at all.
     * @type {Boolean}
     * @default true
     */
    this.getFeatureInfoAsXml = true;

    knockout.track(this, ['url', 'layers', 'parameters']);
};

WebMapServiceDataSourceViewModel.prototype = inherit(ImageryLayerDataSourceViewModel.prototype);

defineProperties(WebMapServiceDataSourceViewModel.prototype, {
});

/**
 * Updates the WMS data item from a JSON object-literal description of it.
 *
 * @param {Object} json The JSON description.  The JSON should be in the form of an object literal, not a string.
 */
 WebMapServiceDataSourceViewModel.prototype.updateFromJson = function(json) {
    this.name = defaultValue(json.name, 'Unnamed Item');
    this.description = defaultValue(json.description, '');
    this.legendUrl = json.legendUrl;
    this.dataUrl = json.dataUrl;
    this.dataUrlType = defaultValue(json.dataUrlType, 'none');

    this.url = defaultValue(json.url, '');
    this.layers = defaultValue(json.layers, '');
    this.getFeatureInfoAsGeoJson = defaultValue(json.getFeatureInfoAsGeoJson, true);
    this.getFeatureInfoAsXml = defaultValue(json.getFeatureInfoAsXml, true);

    if (defined(json.rectangle)) {
        this.rectangle = Rectangle.fromDegrees(json.rectangle[0], json.rectangle[1], json.rectangle[2], json.rectangle[3]);
    } else {
        this.rectangle = Rectangle.MAX_VALUE;
    }

    if (defined(json.parameters)) {
        this.parameters = clone(json.parameters);
    } else {
        this.parameters = clone(WebMapServiceDataSourceViewModel.defaultParameters);
    }

    if (!defined(this.legendUrl)) {
        this.legendUrl = cleanAndProxyUrl(this.context, this.url) + '?service=WMS&version=1.3.0&request=GetLegendGraphic&format=image/png&layer=' + this.layers;
    }
};

WebMapServiceDataSourceViewModel.prototype.enableInCesium = function() {
    if (defined(this._imageryLayer)) {
        throw new DeveloperError('Data item is already enabled.');
    }

    var scene = this.context.cesiumScene;

    var imageryProvider = new WebMapServiceImageryProvider({
        url : cleanAndProxyUrl(this.context, this.url),
        layers : this.layers,
        getFeatureInfoAsGeoJson : this.getFeatureInfoAsGeoJson,
        getFeatureInfoAsXml : this.getFeatureInfoAsXml,
        parameters : this.parameters
    });

    this._imageryLayer = new ImageryLayer(imageryProvider, {
        alpha : this.alpha,
        rectangle : this.rectangle
    });

    scene.imageryLayers.add(this._imageryLayer);
};

WebMapServiceDataSourceViewModel.prototype.disableInCesium = function() {
    if (!defined(this._imageryLayer)) {
        throw new DeveloperError('Data item is not enabled.');
    }

    var scene = this.context.cesiumScene;

    scene.imageryLayers.remove(this._imageryLayer);
    this._imageryLayer = undefined;
};

WebMapServiceDataSourceViewModel.prototype.enableInLeaflet = function() {
    if (defined(this._imageryLayer)) {
        throw new DeveloperError('Data item is already enabled.');
    }

    var map = this.context.leafletMap;

    var options = {
        layers : this.layers,
        opacity : this.alpha,
        bounds : rectangleToLatLngBounds(this.rectangle)
    };

    options = combine(this.parameters, options);

    this._imageryLayer = new L.tileLayer.wms(cleanAndProxyUrl(this.context, this.url), options);
    map.addLayer(this._imageryLayer);
};

WebMapServiceDataSourceViewModel.prototype.disableInLeaflet = function() {
    if (!defined(this._imageryLayer)) {
        throw new DeveloperError('Data item is not enabled.');
    }

    var map = this.context.leafletMap;

    map.removeLayer(this._imageryLayer);
    this._imageryLayer = undefined;
};

WebMapServiceDataSourceViewModel.defaultParameters = {
    transparent: true,
    format: 'image/png',
    exceptions: 'application/vnd.ogc.se_xml',
    style: ''
};

function cleanAndProxyUrl(context, url) {
    // Strip off the search portion of the URL
    var uri = new URI(url);
    uri.search('');

    var cleanedUrl = uri.toString();
    if (defined(context.corsProxy) && context.corsProxy.shouldUseProxy(cleanedUrl)) {
        cleanedUrl = context.corsProxy.getURL(cleanedUrl);
    }

    return cleanedUrl;
}

module.exports = WebMapServiceDataSourceViewModel;
