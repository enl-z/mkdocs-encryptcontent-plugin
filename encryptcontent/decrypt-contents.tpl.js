/* encryptcontent/decrypt-contents.tpl.js */

/* Strips the padding character from decrypted content. */
function strip_padding(padded_content, padding_char) {
    for (var i = padded_content.length; i > 0; i--) {
        if (padded_content[i - 1] !== padding_char) {
            return padded_content.slice(0, i);
        }
    }
    return '';
};

/* Decrypts the content from the ciphertext bundle. */
function decrypt_content(password, iv_b64, ciphertext_b64, padding_char) {
    var key = CryptoJS.MD5(password),
        iv = CryptoJS.enc.Base64.parse(iv_b64),
        ciphertext = CryptoJS.enc.Base64.parse(ciphertext_b64),
        bundle = {
            key: key,
            iv: iv,
            ciphertext: ciphertext
        };
    var plaintext = CryptoJS.AES.decrypt(bundle, key, {
        iv: iv,
        padding: CryptoJS.pad.NoPadding
    });
    try {
        return strip_padding(plaintext.toString(CryptoJS.enc.Utf8), padding_char);
    } catch (err) {
        // encoding failed; wrong password
        return false;
    }
};

/* Split cyphertext bundle and try to decrypt it */
function decrypt_content_from_bundle(password, ciphertext_bundle) {
    // grab the ciphertext bundle and try to decrypt it
    if (ciphertext_bundle) {
        let parts = ciphertext_bundle.split(';');
        if (parts.length == 3) {
            return decrypt_content(password, parts[0], parts[1], parts[2]);
        }
    }
    return false;
};

{% if remember_password -%}
/* Set key:value with expire time in sessionStorage/localStorage */
function setItemExpiry(key, value, ttl) {
    const now = new Date()
    const item = {
        value: encodeURIComponent(value),
        expiry: now.getTime() + ttl,
    }
    {% if session_storage -%}
    sessionStorage.setItem('encryptcontent_' + encodeURIComponent(key), JSON.stringify(item))
    {%- else %}
    localStorage.setItem('encryptcontent_' + encodeURIComponent(key), JSON.stringify(item))
    {%- endif %}
};

/* Delete key with specific name in sessionStorage/localStorage */
function delItemName(key) {
    {% if session_storage -%}
    sessionStorage.removeItem('encryptcontent_' + encodeURIComponent(key));
    {%- else %}
    localStorage.removeItem('encryptcontent_' + encodeURIComponent(key));
    {%- endif %}
};

/* Get key:value from sessionStorage/localStorage */
function getItemExpiry(key) {
    {% if session_storage -%}
    var remember_password = sessionStorage.getItem('encryptcontent_' + encodeURIComponent(key));
    {%- else %}
    var remember_password = localStorage.getItem('encryptcontent_' + encodeURIComponent(key));
    {%- endif %}
    if (!remember_password) {
        // fallback to search default password defined by path
        {% if session_storage -%}
        var remember_password = sessionStorage.getItem('encryptcontent_' + encodeURIComponent("/"));
        {%- else %}
        var remember_password = localStorage.getItem('encryptcontent_' + encodeURIComponent("/"));
        {%- endif %}
        if (!remember_password) {
            return null
        }
    }
    const item = JSON.parse(remember_password)
    const now = new Date()
    if (now.getTime() > item.expiry) {
        // if the item is expired, delete the item from storage and return null
        delItemName(key)
        return null
    }
    return decodeURIComponent(item.value)
};
{%- endif %}

/* Reload scripts src after decryption process */
function reload_js(src) {
    $('script[src="' + src + '"]').remove();
    $('<script>').attr('src', src).appendTo('head');
};

/* Decrypt part of the search index and refresh it for search engine */
function decrypt_search(password_value, path_location) {
    sessionIndex = sessionStorage.getItem('encryptcontent-index');
    if (sessionIndex) {
        sessionIndex = JSON.parse(sessionIndex);
        for (var i=0; i < sessionIndex.docs.length; i++) {
            var doc = sessionIndex.docs[i];
            if (doc.location.indexOf(path_location.replace('{{ site_path }}', '')) !== -1) {
                // grab the ciphertext bundle and try to decrypt it
                let title = decrypt_content_from_bundle(password_value, doc.title);
                if (title !== false) {
                    doc.title = title;
                    // any post processing on the decrypted search index should be done here
                    let content = decrypt_content_from_bundle(password_value, doc.text);
                    if (content !== false) {
                        doc.text = content;
                        let location_bundle = doc.location;
                        let location_sep = location_bundle.indexOf(';')
                        if (location_sep !== -1) {
                            let toc_bundle = location_bundle.substring(location_sep+1)
                            let location_doc = location_bundle.substring(0,location_sep)
                            let toc_url = decrypt_content_from_bundle(password_value, toc_bundle);
                            if (toc_url !== false) {
                                doc.location = location_doc + toc_url;
                            }
                        }
                    }
                }
            }
        }
        // force search index reloading on Worker
        if (!window.Worker) {
            console.log('Web Worker API not supported');
        } else {
            sessionIndex = JSON.stringify(sessionIndex);
            sessionStorage.setItem('encryptcontent-index', sessionIndex);
            searchWorker.postMessage({init: true, sessionIndex: sessionIndex});
        }
    }
};

/* Decrypt speficique html entry from mkdocs configuration */
function decrypt_somethings(password_value, encrypted_something) {
    var html_item = '';
    for (const [name, tag] of Object.entries(encrypted_something)) {
        if (tag[1] == 'id') {
            html_item = [document.getElementById(name)];
        } else if (tag[1] == 'class') {
            html_item = document.getElementsByClassName(name);
        } else {
            console.log('WARNING: Unknow tag html found, check "encrypted_something" configuration.');
        }
        if (html_item) {
            for (i = 0; i < html_item.length; i++) {
                // grab the cipher bundle if something exist
                let content = decrypt_content_from_bundle(password_value, html_item[i].innerHTML);
                if (content !== false) {
                    // success; display the decrypted content
                    html_item[i].innerHTML = content;
                    html_item[i].style.display = null;
                    // any post processing on the decrypted content should be done here
                }
            }
        }
    }
};

/* Decrypt content of a page */
function decrypt_action(password_input, encrypted_content, decrypted_content, display_err=true) {
    // grab the ciphertext bundle
    // and decrypt it
    let content = decrypt_content_from_bundle(password_input.value, encrypted_content.innerHTML);
    if (content !== false) {
        // success; display the decrypted content
        decrypted_content.innerHTML = content;
        // encrypted_content.parentNode.removeChild(encrypted_content);
        // any post processing on the decrypted content should be done here
        {% if arithmatex -%}
        if (typeof MathJax === 'object') { MathJax.typesetPromise(); };
        {%- endif %}
        {% if mermaid2 -%}
        if (typeof mermaid === 'object') { mermaid.contentLoaded(); };
        {%- endif %}
        {% if hljs -%}
        document.getElementById("mkdocs-decrypted-content").querySelectorAll('pre code').forEach((block) => {
            hljs.highlightBlock(block);
        });
        {%- endif %}
        {% if reload_scripts | length > 0 -%}
        let reload_scripts = {{ reload_scripts }};
        for (i = 0; i < reload_scripts.length; i++) { 
            reload_js(reload_scripts[i]);
        }
        {%- endif %}
        return true
    } else {
        if (display_err) {
            // create HTML element for the inform message
            let mkdocs_decrypt_msg = document.getElementById('mkdocs-decrypt-msg');
            mkdocs_decrypt_msg.textContent = '{{ decryption_failure_message }}';
        }
        password_input.value = '';
        password_input.focus();
        return false
    }
};

/* Trigger decryption process */
function init_decryptor() {
    var password_input = document.getElementById('mkdocs-content-password'),
        encrypted_content = document.getElementById('mkdocs-encrypted-content'),
        decrypted_content = document.getElementById('mkdocs-decrypted-content'),
        {% if password_button -%}
        decrypt_button = document.getElementById("mkdocs-decrypt-button"),
        {%- endif %}
        decrypt_form = document.getElementById('mkdocs-decrypt-form');
    // adjust password field width to placeholder length
    let input = document.getElementById("mkdocs-content-password");
    input.setAttribute('size', input.getAttribute('placeholder').length);
    {% if encrypted_something -%}
    var encrypted_something = {{ encrypted_something }};
    {%- endif %}

    {% if remember_password -%}
    /* If remember_password is set, try to use sessionStorage/localstorage item to decrypt content when page is loaded */
    var password_cookie = getItemExpiry(window.location.pathname);
    if (password_cookie) {
        password_input.value = password_cookie.value;
        var content_decrypted = decrypt_action(
            password_input, encrypted_content, decrypted_content
        );
        if (content_decrypted) {
            // continue to decrypt others parts
            {% if experimental -%}
            var search_decrypted = decrypt_search(password_input.value, window.location.pathname.substring(1));
            {%- endif %}
            {% if encrypted_something -%}
            var something_decrypted = decrypt_somethings(password_input.value, encrypted_something);
            {%- endif %}
        } else {
            // remove item on sessionStorage/localStorage if decryption process fail (Invalid item)
            delItemName(window.location.pathname)
        }
    };
    {%- endif %}

    {% if password_button -%}
    /* If password_button is set, try decrypt content when button is press */
    if (decrypt_button) {
        decrypt_button.onclick = function(event) {
            event.preventDefault();
            var content_decrypted = decrypt_action(
                password_input, encrypted_content, decrypted_content
            );
            if (content_decrypted) {
                {% if remember_password -%}
                // keep password value on sessionStorage/localStorage with specific path (relative)
                setItemExpiry(document.location.pathname, password_input.value, 1000*3600*{{ default_expire_delay | int }});
                {%- endif %}
                // continue to decrypt others parts
                {% if experimental -%}
                var search_decrypted = decrypt_search(password_input, window.location.pathname.substring(1));
                {%- endif %}
                {% if encrypted_something -%}
                var something_decrypted = decrypt_somethings(password_input.value, encrypted_something);
                {%- endif %}
            } else {
                // TODO ?
            };
        };
    }
    {%- endif %}

    /* Default, try decrypt content when key (ctrl) enter is press */
    password_input.addEventListener('keypress', function(event) {
        if (event.key === "Enter") {
            var location_path = document.location.pathname;
            var is_global = false;
            if (event.ctrlKey) { 
                var location_path = "/";
                var is_global = true;
            };
            event.preventDefault();
            var content_decrypted = decrypt_action(
                password_input, encrypted_content, decrypted_content
            );
            if (content_decrypted) {
                {% if remember_password -%}
                // keep password value on sessionStorage/localStorage with specific path (relative)
                setItemExpiry(location_path, password_input.value, 1000*3600*{{ default_expire_delay | int }});
                {%- endif %}
                // continue to decrypt others parts
                {% if experimental -%}
                if (is_global) {
                    var search_decrypted = decrypt_search(password_input, location_path);
                } else {
                    var search_decrypted = decrypt_search(password_input, location_path.substring(1));
                };
                {%- endif %}
                {% if encrypted_something -%}
                var something_decrypted = decrypt_somethings(password_input.value, encrypted_something);
                {%- endif %}
            } else {
                // TODO ?
            };
        }
    });
};

document.addEventListener('DOMContentLoaded', init_decryptor());
