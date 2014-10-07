
var handler;

/** @constructor */
function OpenmixApplication(settings) {
    'use strict';

    /**
     * @param {OpenmixConfiguration} config
     */
    this.do_init = function(config) {
        var i;
        for (i = 0; i < settings.providers.length; i += 1) {
            config.requireProvider(settings.providers[i].alias);
        }
    };

    /**
     * @param {OpenmixRequest} request
     * @param {OpenmixResponse} response
     */
    this.handle_request = function(request, response) {
        var avail,
            fusion,
            hostname,
            candidates,
            rtt,
            all_reasons,
            decision_provider,
            decision_reasons = [],
            decision_ttl,
            override_cname;

        function parse_fusion_data(source) {
            var result = {}, i, j, lines, headers, current_line, tmp_result;
            lines = source.split("\n");
            headers = lines[0].split(",");

            for (i = 1; i < lines.length; i += 1) {
                current_line = lines[i].split(",");
                tmp_result = {};

                for (j = 1; j < headers.length; j += 1) {
                    tmp_result[headers[j]] = current_line[j];
                }
                result[current_line[0]] = tmp_result;
            }
            return result;
        }

        function provider_from_alias(alias) {
            var i;
            for (i = 0; i < settings.providers.length; i += 1) {
                if (alias === settings.providers[i].alias) {
                    return settings.providers[i];
                }
            }
            return null;
        }

        function flatten(obj, property) {
            var result = {}, i;
            for (i in obj) {
                if (obj.hasOwnProperty(i)) {
                    if (obj[i].hasOwnProperty(property) && obj[i][property]) {
                        result[i] = obj[i][property];
                    }
                }
            }
            return result;
        }

        function properties_array(container, fun) {
            var i, result = [];
            for (i in container) {
                if (container.hasOwnProperty(i)) {
                    if (fun.call(null, i)) {
                        result.push(i);
                    }
                }
            }
            return result;
        }

        function add_rtt_padding(data) {
            var i, provider;
            for (i in data) {
                if (data.hasOwnProperty(i)) {
                    //console.log(data[i]);
                    provider = provider_from_alias(i);
                    data[i] = data[i] * (1 + provider.padding / 100);
                }
            }
            return data;
        }

        function object_to_tuples_array(container) {
            var i, result = [];
            for (i in container) {
                if (container.hasOwnProperty(i)) {
                    result.push([i, container[i]]);
                }
            }
            return result;
        }

        all_reasons = {
            optimum_server_chosen: 'A',
            no_available_servers: 'B',
            missing_fusion_data: 'C'
        };

        avail = flatten(request.getProbe('avail'), 'avail');
        fusion = parse_fusion_data(request.getData('fusion'));
        hostname = request.hostname_prefix;

        // First figure out the available platforms
        candidates = properties_array(avail, function(i) {
            return (avail[i] && (settings.availability_threshold <= avail[i]));
        });
        //console.log('available candidates: ' + JSON.stringify(candidates));

        // Get the RTT scores, transformed and filtered for use
        rtt = flatten(request.getProbe('http_rtt'), 'http_rtt');
        // rtt now maps provider alias to round-trip time
        rtt = add_rtt_padding(rtt);
        // rtt now contains scores with penalties/bonuses applied
        rtt = object_to_tuples_array(rtt);
        // rtt is now a multi-dimensional array; [ [alias, score], [alias, score] ]
        rtt = rtt.filter(function(tuple) {
            return -1 < candidates.indexOf(tuple[0]);
        });
        // rtt now only contains those providers that meet the availability threshold
        rtt.sort(function(left, right) {
            if (left[1] < right[1]) {
                return -1;
            }
            if (left[1] > right[1]) {
                return 1;
            }
            return 0;
        });
        // rtt is now sorted in ascending order of round-trip time
        //console.log('rtt: ' + JSON.stringify(rtt));

        if (0 < rtt.length) {
            decision_provider = provider_from_alias(rtt[0][0]);
            decision_reasons.push(all_reasons.optimum_server_chosen);
            decision_ttl = decision_ttl || settings.default_ttl;
        } else {
            decision_provider = settings.fallback;
            decision_ttl = decision_ttl || settings.error_ttl;
            decision_reasons.push(all_reasons.no_available_servers);
        }

        if (fusion[hostname] && fusion[hostname][decision_provider.alias]) {
            override_cname = fusion[hostname][decision_provider.alias];
        } else {
            decision_reasons.push(all_reasons.missing_fusion_data);
        }

        response.respond(decision_provider.alias, override_cname || decision_provider.cname);
        response.setTTL(decision_ttl);
        response.setReasonCode(decision_reasons.join(','));
    };
}

handler = new OpenmixApplication({
    // `providers` contains a list of the providers to be load-balanced
    // `alias` is the Openmix alias set in the Portal
    // `cname` is the CNAME or IP address to be sent as the answer when this provider is selected
    // `padding` is a penalty (or bonus) to be applied as in percentage of the actual score, e.g. 10 = 10% slower (score * 1.1)
    providers: [
        {
            alias: 'cdn1',
            cname: 'tobeoverwritten',
            padding: 0
        },
        {
            alias: 'cdn2',
            cname: 'tobeoverwritten',
            padding: 0
        },
        {
            alias: 'cdn3',
            cname: 'tobeoverwritten',
            padding: 0
        }
    ],
    // The minimum availability score that providers must have in order to be considered available
    availability_threshold: 90,
    min_valid_rtt_score: 5,
    // The TTL to be set when the application chooses an optimal provider, including geo override.
    default_ttl: 20,
    // The TTL to be set when the application chooses a potentially non-optimal provider, e.g. default or geo default.
    error_ttl: 20,
    // Openmix is sometimes unable to calculate a response
    // Generally fewer than 0.01% of responses over a month are fallback
    // We need one CDN that can return content from any site, based on the HTTP HOST HEADER
    // the browser passes through, though we can also append the subdomain if that helps
    fallback: { alias: 'cdn1', cname: 'provider1.example.com' }
});

function init(config) {
    'use strict';
    handler.do_init(config);
}

function onRequest(request, response) {
    'use strict';
    handler.handle_request(request, response);
}
