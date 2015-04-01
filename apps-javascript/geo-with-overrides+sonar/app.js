var handler = new OpenmixApplication({
    // `providers` contains a list of the providers to be load-balanced
    // `alias` is the Openmix alias set in the Portal
    // `cname` is the CNAME or IP address to be sent as the answer when this provider is selected
    providers: {
        'foo': {
            cname: 'www.foo.com'
        },
        'bar': {
            cname: 'www.bar.com'
        },
        'baz': {
            cname: 'www.baz.com'
        }
    },
    // A mapping of ISO 3166-1 country codes to provider aliases
    //country_to_provider: { 'UK': 'bar', 'ES': 'baz' },
    country_to_provider: {},
    // A mapping of market codes to provider aliases
    //market_to_provider: { 'EG': 'foo' }
    market_to_provider: {},
    // Selected if a provider can't be determined
    default_provider: 'foo',
    // The TTL to be set when the application chooses a geo provider.
    default_ttl: 20,
    // The TTL to be set when the application chooses the default provider.
    error_ttl: 20,
    // sonar values are between 0 - 1
    sonar_threshold: 0.9,
    // flip to true if the platform will be considered unavailable if it does not have sonar data
    require_sonar_data: false
});

function init(config) {
    'use strict';
    handler.do_init(config);
}

function onRequest(request, response) {
    'use strict';
    handler.handle_request(request, response);
}

/** @constructor */
function OpenmixApplication(settings) {
    'use strict';

    var aliases = settings.providers === undefined ? [] : Object.keys(settings.providers);

    /**
     * @param {OpenmixConfiguration} config
     */
    this.do_init = function(config) {
        var i = aliases.length;

        while (i --) {
            config.requireProvider(aliases[i]);
        }
    };

    /**
     * @param {OpenmixRequest} request
     * @param {OpenmixResponse} response
     */
    this.handle_request = function(request, response) {
        var dataSonar  = parseSonarData(request.getData('sonar')),
            allReasons,
            decisionProvider,
            decisionReason,
            failedCandidates,
            decisionTtl;

        allReasons = {
            got_expected_market: 'A',
            geo_override_on_country: 'B',
            unexpected_market: 'C',
            geo_sonar_failed: 'D',
            no_available_provider: 'E'
        };

        // determine which providers have a sonar value below threshold
        function belowSonarThreshold(alias) {
            if (dataSonar[alias] !== undefined) {
                return (dataSonar[alias] < settings.sonar_threshold);
            }
            return settings.require_sonar_data;
        }


        function isEmpty(obj) {
            return Object.keys(obj).length === 0;
        }

        // used for reason code logging
        function failedGeoLocation() {
            if (!isEmpty(failedCandidates)) {
                if (settings.country_to_provider !== undefined
                    && settings.country_to_provider[request.country] !== undefined
                    && failedCandidates[settings.country_to_provider[request.country]] !== undefined) {
                    return true;
                }

                if (settings.market_to_provider !== undefined
                    && settings.market_to_provider[request.market] !== undefined
                    && failedCandidates[settings.market_to_provider[request.market] ] !== undefined) {
                    return true;
                }
            }

            return false;
        }

        function getDefaultProvider() {
            // the default provider is good, use it
            if (isEmpty(failedCandidates) || failedCandidates[settings.default_provider] === undefined) {
                return settings.default_provider;
            }

            // get the first available provider where sonar value is good
            var keys = Object.keys(settings.providers),
                i = keys.length,
                key;

            while (i --) {
                key = keys[i];

                if (failedCandidates[key] === undefined) {
                    return key;
                }
            }

            // log no available providers and return the default_provider
            decisionReason = allReasons.no_available_provider + allReasons.unexpected_market;
            return settings.default_provider;

        }

        failedCandidates = filterObject(settings.providers, belowSonarThreshold);

        /* jshint laxbreak:true */
        if (settings.country_to_provider !== undefined
            && settings.country_to_provider[request.country] !== undefined
            && failedCandidates[settings.country_to_provider[request.country]] === undefined) {
            // Override based on the request country
            decisionProvider = settings.country_to_provider[request.country];
            decisionTtl = decisionTtl || settings.default_ttl;
            decisionReason = allReasons.geo_override_on_country;
        }
        else if (settings.market_to_provider !== undefined
            && settings.market_to_provider[request.market] !== undefined
            && failedCandidates[settings.market_to_provider[request.market] ] === undefined) {
            // Override based on the request market
            decisionProvider = settings.market_to_provider[request.market];
            decisionTtl = decisionTtl || settings.default_ttl;
            decisionReason = allReasons.got_expected_market;
        }
        else {

            decisionProvider = getDefaultProvider();
            decisionTtl = decisionTtl || settings.error_ttl;
            if (decisionReason === undefined || decisionReason.indexOf(allReasons.no_available_provider) === -1 ) {
                if (failedGeoLocation() ) {
                    decisionReason = allReasons.geo_sonar_failed + allReasons.unexpected_market;
                }else if( decisionReason === undefined) {
                    decisionReason = allReasons.unexpected_market;
                }
            }
        }
        /* jshint laxbreak:false */

        response.respond(decisionProvider, settings.providers[decisionProvider].cname);
        response.setTTL(decisionTtl);
        response.setReasonCode(decisionReason);
    };

     function filterObject(object, filter) {
        var keys = Object.keys(object),
            i = keys.length,
            key,
            data = {};

        while (i --) {
            key = keys[i];

            if (filter(key)) {
                data[key] = (object[key]);
            }
        }

        return data;
    }

    /**
     * @param {!Object} data
     */
    function parseSonarData(data) {
        var keys = Object.keys(data),
            i = keys.length,
            key;
        while (i --) {
            key = keys[i];
            try {
                data[key] = JSON.parse(data[key]);
            }
            catch (e) {
                delete data[key];
            }
        }
        return data;
    }
}
