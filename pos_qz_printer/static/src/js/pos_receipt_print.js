
odoo.define('pos_qz_printer.pos_receipt_print', function (require) {
    "use strict";

    let rpc = require('web.rpc');
    let screens = require('point_of_sale.screens');

    /// Authentication setup ///
    qz.security.setCertificatePromise(function(resolve, reject) {
        //Preferred method - from server
//        fetch("assets/signing/digital-certificate.txt", {cache: 'no-store', headers: {'Content-Type': 'text/plain'}})
//          .then(function(data) { data.ok ? resolve(data.text()) : reject(data.text()); });

        //Alternate method 1 - anonymous
//        resolve();  // remove this line in live environment

        //Alternate method 2 - direct

        //Aquí va el contenido de cert.pem
        resolve("-----BEGIN CERTIFICATE-----\n" +
            "MIIEOzCCAyOgAwIBAgIUfjftE3R8Q5Kuyy3iAyiNcWKIyyQwDQYJKoZIhvcNAQEL\n" +
            "BQAwgasxCzAJBgNVBAYTAkNVMREwDwYDVQQIDAhIb2xndcKhbjERMA8GA1UEBwwI\n" +
            "SG9sZ3XCoW4xFTATBgNVBAoMDE9kb28gZXhwZXJ0czEVMBMGA1UECwwMT2RvbyBF\n" +
            "eHBlcnRzMR8wHQYDVQQDDBZ2bXAub2Rvb2V4cGVydHMuY29tLm14MScwJQYJKoZI\n" +
            "hvcNAQkBFhh2bGFkaW1pcjg4MTAwMkBnbWFpbC5jb20wIBcNMjAxMDA3MDI1ODQy\n" +
            "WhgPMjA1MjA0MDEwMjU4NDJaMIGrMQswCQYDVQQGEwJDVTERMA8GA1UECAwISG9s\n" +
            "Z3XCoW4xETAPBgNVBAcMCEhvbGd1wqFuMRUwEwYDVQQKDAxPZG9vIGV4cGVydHMx\n" +
            "FTATBgNVBAsMDE9kb28gRXhwZXJ0czEfMB0GA1UEAwwWdm1wLm9kb29leHBlcnRz\n" +
            "LmNvbS5teDEnMCUGCSqGSIb3DQEJARYYdmxhZGltaXI4ODEwMDJAZ21haWwuY29t\n" +
            "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA2JoUu6I9pzKMyUV2Nio4\n" +
            "Xp38pZ2J15Aj8Aeob8Pk6PP9+gsV8yVeLWJ7sZsFEihFzKF7+Tur/QBENUTTqk2j\n" +
            "zdEInDFNh+dmH33W+z2/8lTXCMtzdjEls5ni8qxSsfN9uZGdkuQ+yYvW0qgD9Mxu\n" +
            "MLYc0GE6O/sWUcsPvJFFIVa9IWl2Kug0k7ZO7HHslvVqaBqYsr+MOM13AUWquMj4\n" +
            "+3FLjvHPy49Ksy/DSw630Opilzkx4WiBoRun6B7dsoAUOTkZwCNZWEsgAgVse3wa\n" +
            "MYnWh5OrJ3hSKkDaDaFO6HqgXrfwWCkWJsyaw3tt5+go/B3f88A9zvvqEaU9wBWP\n" +
            "zwIDAQABo1MwUTAdBgNVHQ4EFgQUzyEE5Re4twVG/49Naa3TOLGPdgIwHwYDVR0j\n" +
            "BBgwFoAUzyEE5Re4twVG/49Naa3TOLGPdgIwDwYDVR0TAQH/BAUwAwEB/zANBgkq\n" +
            "hkiG9w0BAQsFAAOCAQEAqe/vfUSQXNnvK4eG2OILECdINd34NAfPRLbsecMQX1v3\n" +
            "jYR4MnFJg+RMUOt66opN4MWri1EdYYISoBh2Iaw6PaQwoS6Hf9sgcODN292TZVK4\n" +
            "fuvSDywRk3MQGMi8bKERS+pUVQvpc67hzJfHtJsuuQjoSlY+nqtMFAfwYpYYSSSk\n" +
            "2MHMMhdNetUtb5Z7LzG5rnyBzgMtewjOvz33M6aKFj4m+fnWmayUDw1YoXbkElZ+\n" +
            "/eQx+Xc7IlJLF/CRHPEF1U1EIPVDW1DupscbtdS8t0ykW9Bi4j17TSAxvwHFY/dz\n" +
            "xnlGQdrfXAx5wcxIZ3CksNKDfYw87kpp+Iz+XOrPeA==\n" +
            "-----END CERTIFICATE-----");
        //
        //     resolve("-----BEGIN CERTIFICATE-----\n" +
        //     "MIIEJzCCAw+gAwIBAgIUZBiEqLcWY/TFyR/k7iO+jczNN2MwDQYJKoZIhvcNAQEL\n" +
        //     "BQAwgaExCzAJBgNVBAYTAkNVMQ8wDQYDVQQIDAZIYXZhbmExFDASBgNVBAcMC0hh\n" +
        //     "dmFuYSBDaXR5MRgwFgYDVQQKDA9PZG9vIEV4cGVydHMgTVgxEDAOBgNVBAsMB0Rl\n" +
        //     "dmVsb3AxEjAQBgNVBAMMCWxvY2FsaG9zdDErMCkGCSqGSIb3DQEJARYcanVhbi5j\n" +
        //     "YXJsb3MuZmRlei44OWdtYWlsLmNvbTAgFw0yMDEwMDYwMTA2MzRaGA8yMDUyMDMz\n" +
        //     "MTAxMDYzNFowgaExCzAJBgNVBAYTAkNVMQ8wDQYDVQQIDAZIYXZhbmExFDASBgNV\n" +
        //     "BAcMC0hhdmFuYSBDaXR5MRgwFgYDVQQKDA9PZG9vIEV4cGVydHMgTVgxEDAOBgNV\n" +
        //     "BAsMB0RldmVsb3AxEjAQBgNVBAMMCWxvY2FsaG9zdDErMCkGCSqGSIb3DQEJARYc\n" +
        //     "anVhbi5jYXJsb3MuZmRlei44OWdtYWlsLmNvbTCCASIwDQYJKoZIhvcNAQEBBQAD\n" +
        //     "ggEPADCCAQoCggEBAMlBeIXH+LIS6hStsIgttPuE8bZiAuzlAvNqhXryrcibyD/7\n" +
        //     "6ciD4XJ2IUqmb7Zrmq8bmrVzvMg7OZOILk8PHYkPiFjASu/4t0evC+z+cXFdcycB\n" +
        //     "vlJSCyPpZTIKX5UeWspFeTgaqdcmJ4fNBtadm2R8JiaZgrQrIzL6Q5S9RMVTDRlU\n" +
        //     "BT6hy8J+INtFA5yN+OwmW6NgXcjQqiQZeMEqW0dzh0EnaNj0rGb6AWtBO4a9YyVD\n" +
        //     "o3BZVFJXFYaDjvQu+d62c9JEaw3RIOcmdwaiOXdIfvRg7NVXsc0dyuRe/vZyiyTl\n" +
        //     "7T2B3QrZ/SEN2f3gKqjcpd+gna4DG7I1K2AgH3ECAwEAAaNTMFEwHQYDVR0OBBYE\n" +
        //     "FA7Qo9waJBZr79JyN4NFKUjZiPxeMB8GA1UdIwQYMBaAFA7Qo9waJBZr79JyN4NF\n" +
        //     "KUjZiPxeMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBAHhJrCTs\n" +
        //     "T7S9Id7Eug7T7LKnUu0tmDzDTXlXKCYcEzdCUZmmgz7YAGPSIljad+6Q6/gPtr4H\n" +
        //     "Ywk/7SIESW6X4SQnwUBrkVjerN1GFUimW8d2ubX3lxe82lxQgPNBMBhTLQe+Epys\n" +
        //     "kEUxdp6hH9x3NvtRBnSbE+KI1MFWDk9d+9Jh+jQJXRZbMS/BJFnVY9Eb2n/RIH/U\n" +
        //     "2sNGOnpjZZkAek4nmWpOqGIIWBfhgaQYWTPEWhUpJpMqVYrCg9/hgq1GZoAiujeU\n" +
        //     "Z6WuBNbG7cykdPR7QzM7PnKqAfGD08OHmiVsS+Egno7sWeCP/OogBm2L+LB2nJqu\n" +
        //     "8swChJSQx7mAuVE=\n" +
        //     "-----END CERTIFICATE-----");
    });

    //Aquí va el contenido de key.pem
    let privateKey = "-----BEGIN PRIVATE KEY-----\n" +
        "MIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQDYmhS7oj2nMozJ\n" +
        "RXY2KjhenfylnYnXkCPwB6hvw+To8/36CxXzJV4tYnuxmwUSKEXMoXv5O6v9AEQ1\n" +
        "RNOqTaPN0QicMU2H52Yffdb7Pb/yVNcIy3N2MSWzmeLyrFKx8325kZ2S5D7Ji9bS\n" +
        "qAP0zG4wthzQYTo7+xZRyw+8kUUhVr0haXYq6DSTtk7sceyW9WpoGpiyv4w4zXcB\n" +
        "Raq4yPj7cUuO8c/Lj0qzL8NLDrfQ6mKXOTHhaIGhG6foHt2ygBQ5ORnAI1lYSyAC\n" +
        "BWx7fBoxidaHk6sneFIqQNoNoU7oeqBet/BYKRYmzJrDe23n6Cj8Hd/zwD3O++oR\n" +
        "pT3AFY/PAgMBAAECggEBAIPwr6pwNKARYcMExfJOm5G/KPP1V87wZYPEFm0mZd0l\n" +
        "K1NRx2gaHhkFQZW5eUhLMeFpiKwUFjsCG4pbR5gYvSwVJeqG+dRMN1/9dqQKRE8o\n" +
        "MOiRjd60J2QU3DK4l5MAYFhWhCbDVB/PR+eAIxDOKl0PwdOJNkDtPPZL/GUAFJ0u\n" +
        "KpUPfdg+pCG25OxaLSA8rLYAG2PGIo94w0Pj92Opn6PfdAgA/M7DDes+QCnT4psa\n" +
        "YE1i4taAy8e98KA7GeVc10cSW/fwUkqDf7t2rbitXTyokxU7wHk3AwHVOMEqR7Q6\n" +
        "nexauyXHMi87JwHfABSgtWD0+eB9CbEohw+3vPQUtskCgYEA+ik1B5Rxhhs2HGbd\n" +
        "JNTpU6Lj1q+UWg+2mX7qayoKI5v0hK1qr/+JN4OHXSjX6Vn4o1d24lfPoCL/khGd\n" +
        "70IhuO68rUUer5VLL0y9EL8RyqF+blyPlrjrw7zsQe/EZbOMZRSYjp0QnlJY6/Lh\n" +
        "5s2yr46DpTU3dT4aJtsgyfxnGyMCgYEA3ahY8JzVrSQY3A1FxEyGCfdjRAK8WC8I\n" +
        "Ixa+eDqMDLYLgrYe0SdVpTUBQA+n0GoF3g6ZLAjTqfY/Egi6uLXtrpXrqFdCY9Up\n" +
        "anJHzkBHQnyy4bio8eS38Wn5o72GdnFD6qnNQGUA211SV4aG59pGpbxCB96fs3/D\n" +
        "29/e6U9H6WUCgYEAlhWY6jZGMdYrjbitHsbaQcJtfUUT9UCOJeM+ExNCyABuIBfG\n" +
        "9VaTZYn08ZBqkWbYRG9aNQvH1mSI/oKxRXVgtAoPisj4UxF37SXWHLD1pKNlLiM8\n" +
        "RoolcObsu9Z09ytUpORJbu6OpN302YJ7w7RPawJOuxSFdELQ/9TiBCz5Uw8CgYEA\n" +
        "wpVS3ocPnVse565PHLAAyyb9YWr1ZISFJCiHNIxQ/aeiGzE9hGZ/bPRHELGto+wv\n" +
        "EmzGUj29cmrVm0NGh3hOGwFJSxKvGWy7WtLP7mPHKrrFXhn5VcBvKeLaX7+1Fqz/\n" +
        "7jT6FhmU0v3tlyBltYuMkVnerYHluHHkwlSZHz+V5XECgYBru0rf8b/KWNKUnEC+\n" +
        "0LvsZrQTBBynv1wEF7hfOKq2MT57Efm5zBvSXyMsMQwGn4/ZSAbkcCHMJugPo3nn\n" +
        "AjKADscjRGYx7yr1PoK/FIy95NNbm8YBIq41wO63H+VN9iFaeqjXQZfI31wXifdg\n" +
        "cleLydfxLMLVphM5NmuFQ5XqAg==\n" +
        "-----END PRIVATE KEY-----\n";
    //
    //     let privateKey = "-----BEGIN PRIVATE KEY-----\n" +
    //     "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDJQXiFx/iyEuoU\n" +
    //     "rbCILbT7hPG2YgLs5QLzaoV68q3Im8g/++nIg+FydiFKpm+2a5qvG5q1c7zIOzmT\n" +
    //     "iC5PDx2JD4hYwErv+LdHrwvs/nFxXXMnAb5SUgsj6WUyCl+VHlrKRXk4GqnXJieH\n" +
    //     "zQbWnZtkfCYmmYK0KyMy+kOUvUTFUw0ZVAU+ocvCfiDbRQOcjfjsJlujYF3I0Kok\n" +
    //     "GXjBKltHc4dBJ2jY9Kxm+gFrQTuGvWMlQ6NwWVRSVxWGg470LvnetnPSRGsN0SDn\n" +
    //     "JncGojl3SH70YOzVV7HNHcrkXv72cosk5e09gd0K2f0hDdn94Cqo3KXfoJ2uAxuy\n" +
    //     "NStgIB9xAgMBAAECggEATGQZh048S/t59pdnJomS5NW1mfDiA2F6GUMZn212IWtg\n" +
    //     "O0k3l/DXJkdIo7lBNhDqCgWEV9OymJ5CYImUalXmdBv9ORLkXuodR4xeDnsWPF2o\n" +
    //     "U+oJf928dMkmrDPbzBJVi+mK9YzJYu0MnDNqoRP5485r/MLQJesp1TPBazfcXrlW\n" +
    //     "Hag+oJXdBq6N6yedFQ8YKplL6jUvomHOWTE7dOrXCCvMp33+C1AV1UwngB5xrjSl\n" +
    //     "vB9pq+0lJ2tLeFckY9ZcBqr0KUzbzBCxkaa1rzF8x5+mvgr3H2I3Bwplw/qx8jLh\n" +
    //     "pBnyY9p2nWm0MDaHG1CSgtKopKpWOKZiQ2LIUZd5QQKBgQD941g1SmCB9ZaDgmqJ\n" +
    //     "OTk3JS6alUyOYR3oceXP5HpTzD/vh9CbZg6ZF3+oVq1VSAREo/ZpDmzo/ZxTXBGV\n" +
    //     "ogKSmTtbbiu/hgAFiEiMMym2bvpKE3pgAgMrC0cptkf+pZt0XGK/c1+50K0nadBG\n" +
    //     "Hb6v3Z/sPBYAJSfG5JVTmHBXpQKBgQDK7guoWHwYZdV/CFyYeNuuNPGDMLnuCSEc\n" +
    //     "OfcuycUGAnAYc57ykMMS94fh/VdUEHjHuRvFe6nN9FwNFp5M2oWmE85h6FirRieo\n" +
    //     "iiCmuI7StwB22OWsdOLD1PcPBdOYfZO+/ZPIluqU7IlF6NtI2v0SXdoZ7cVePAnG\n" +
    //     "kBK8Mji+3QKBgQDr9ZgsZwTMo+AQN2wmPt2zJ8ZpeuqcxRvTxc9taI5cRU8Cono5\n" +
    //     "gx98Hv/RB0WvJfB5jt1bhEGqRNI+EypwpBK6BtnIvtq/9J0ehyvNyVsyJ3BM2k94\n" +
    //     "3UXuglvQI45D18xj190ay/KispPLNqeQEuL/df3Ew4868U1Hp3g1Kk721QKBgBTj\n" +
    //     "b/vCL/Pq95D98VoYhrRl6r5QU7M26VuYc+MzDb7SnWtG64OYdxwKssgGZejXUTdt\n" +
    //     "zHgFhLMYhikqvNy4Wa2AuGvHmOj4bbihjz7aHImAIOIa7XlVBsqVr2CyftdhhcXR\n" +
    //     "IFczga4WswKpN3lGYWp0krC8kuZiU7dGuUb5/HFZAoGAMznKFt44cUIhr0726P+0\n" +
    //     "rWI3+zJmCVKDdoHLPgKlEd+V7VYMdHsgf5B/JXctNYwOZlCR6W0/wUqkbBvDZVXj\n" +
    //     "ykDCjCifaWWPPsGaIaEp1KW0QYOox+AA8Y7NUoWr7+Za/jF2iZGl2FvVmu7Q7nB8\n" +
    //     "3y70XeowmZ1/UUf0hMw6pYQ=\n" +
    //     "-----END PRIVATE KEY-----";

    qz.security.setSignatureAlgorithm("SHA512"); // Since 2.1
    qz.security.setSignaturePromise(function(toSign) {
        return function(resolve, reject) {
            try {
                let pk = KEYUTIL.getKey(privateKey);
                let sig = new KJUR.crypto.Signature({"alg": "SHA512withRSA"});  // Use "SHA1withRSA" for QZ Tray 2.0 and older
                sig.init(pk);
                sig.updateString(toSign);
                let hex = sig.sign();
                console.log("DEBUG: \n\n" + stob64(hextorstr(hex)));
                resolve(stob64(hextorstr(hex)));
            } catch (err) {
                console.error(err);
                reject(err);
            }
        };
    });

    /// Connection ///
    function startConnection(company_id, data2print) {
        if (!qz.websocket.isActive()) {
            qz.websocket.connect().then(function() {
                console.log('Connection success');
                findVersion(company_id, data2print);
            }).catch(function(err) {
                alert(err || 'Connection failed');
            });
        } else {
            getPrinterFromOdoo(company_id, data2print);
        }
    }

    /// Page load ///
    function findVersion(company_id, data2print) {
        qz.api.getVersion().then(function(data) {
            let qz_version = qz.version
            if (data !== qz_version)
                alert('QZ Tray Version must be equal to ' + qz_version);
            else
                getPrinterFromOdoo(company_id, data2print);
        }).catch(function(err) {
            alert(err || 'Connection failed');
        });
    }

    /// Detection ///
    // Based on findPrinter from sample.html file
    function getPrinterFromOdoo(company_id, data2print) {
        rpc.query({
                model: 'res.company',
                method: 'read',
                args: [[company_id], []],
            }, undefined
        ).done(function(company) {
            let pos_printer = company[0].pos_printer;
            qz.printers.find(pos_printer).then(function(printer) {
                console.log("Found: " + printer);
                setPrinter(printer);
                printReceipt(data2print);
            }).catch(function(err) {
                console.log("Found Printer Error:", err);
            });
        });
    }

    /// QZ Config ///
    // From sample.html check function named updateConfig
    let cfg = null;
    function getUpdatedConfig() {
        if (cfg == null) {
            cfg = qz.configs.create(null);
        }

        cfg.reconfigure({
            copies: 1,
            margins: {top: 0, left: 0.75},

        });
        return cfg
    }

    function setPrinter(printer) {
        let cf = getUpdatedConfig();
        cf.setPrinter(printer);
    }

    /// Pixel Printers ///
    function printReceipt(data2print) {
        let config = getUpdatedConfig();
        // From sample.html check function named getUpdatedOptions
        // let opts = getUpdatedOptions(true);
        let opts = {
            pageWidth: "", // $("#pPxlWidth").val(),
            pageHeight: "", // $("#pPxlHeight").val()
        };

        let printData = [
            {
                type: 'pixel',
                format: 'html',
                flavor: 'plain',
                data: '<html>' +
                    '<body>' +
                        data2print +
                    '</body>' +
                    '</html>',
                options: opts
            }
        ];

        qz.print(config, printData).catch(function(err) {
            alert(err || 'Connection failed');
        });
    }

    screens.ReceiptScreenWidget.include({
        print: function() {
            let company_id = this.pos.company.id;
            let data2print = '';
            let receipt = this.$('.pos-receipt-container')

            if(receipt.length > 0)
                data2print = receipt[0].outerHTML;
            else if (receipt.prevObject.length > 0)
                data2print = receipt.prevObject[0].outerHTML;

            if (data2print === '')
                this._super();
            else
                startConnection(company_id, data2print);
        },
    });
});