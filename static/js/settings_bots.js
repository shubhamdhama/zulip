var settings_bots = (function () {

var exports = {};

function add_bot_row(info) {
    info.id_suffix = _.uniqueId('_bot_');
    var row = $(templates.render('bot_avatar_row', info));
    if (info.is_active) {
        $('#active_bots_list').append(row);
    } else {
        $('#inactive_bots_list').append(row);
    }
}

function is_local_part(value, element) {
    // Adapted from Django's EmailValidator
    return this.optional(element) || /^[\-!#$%&'*+\/=?\^_`{}|~0-9A-Z]+(\.[\-!#$%&'*+\/=?\^_`{}|~0-9A-Z]+)*$/i.test(value);
}

exports.type_id_to_string = function (type_id) {
    var name = _.find(page_params.bot_types, function (bot_type) {
        return bot_type.type_id === type_id;
    }).name;
    return i18n.t(name);
};

function render_bots() {
    $('#active_bots_list').empty();
    $('#inactive_bots_list').empty();

    _.each(bot_data.get_all_bots_for_current_user(), function (elem) {
        add_bot_row({
            name: elem.full_name,
            email: elem.email,
            type: exports.type_id_to_string(elem.bot_type),
            avatar_url: elem.avatar_url,
            api_key: elem.api_key,
            is_active: elem.is_active,
            zuliprc: 'zuliprc', // Most browsers do not allow filename starting with `.`
        });
    });

    if ($("#bots_lists_navbar .add-a-new-bot-tab").hasClass("active")) {
        $("#add-a-new-bot-form").show();
        $("#active_bots_list").hide();
        $("#inactive_bots_list").hide();
    } else if ($("#bots_lists_navbar .active-bots-tab").hasClass("active")) {
        $("#add-a-new-bot-form").hide();
        $("#active_bots_list").show();
        $("#inactive_bots_list").hide();
    } else {
        $("#add-a-new-bot-form").hide();
        $("#active_bots_list").hide();
        $("#inactive_bots_list").show();
    }
}

exports.generate_zuliprc_uri = function (email, api_key) {
    var data = exports.generate_zuliprc_content(email, api_key);

    return "data:application/octet-stream;charset=utf-8," + encodeURIComponent(data);
};

exports.generate_zuliprc_content = function (email, api_key) {
    return "[api]" +
           "\nemail=" + email +
           "\nkey=" + api_key +
           "\nsite=" + page_params.realm_uri +
           // Some tools would not work in files without a trailing new line.
           "\n";
};

function bot_name_from_email(email) {
    return email.substring(0, email.indexOf("-bot@"));
}

exports.generate_flaskbotrc_content = function (email, api_key) {
    return "[" + bot_name_from_email(email) + "]" +
           "\nemail=" + email +
           "\nkey=" + api_key +
           "\nsite=" + page_params.realm_uri +
           "\n";
};

exports.update_bot_settings_tip = function () {
    var permission_type = page_params.bot_permissions_types;
    var current_permission = page_params.realm_add_bot_by_user_permissions;
    var tip_text;
    if (current_permission === permission_type.ADMINS_ONLY.code) {
        tip_text = "Only organization administrators can add bot to this organization";
    } else if (current_permission === permission_type.WEBHOOKS_ONLY.code) {
        tip_text = "Only orgainzation administrators can add generic bot";
    } else {
        tip_text = "Anyone in this organization can add bot";
    }
    $(".bot-settings-tip").text(i18n.t(tip_text));
};

exports.update_bot_permissions_ui = function () {
    exports.update_bot_settings_tip();
    $("#id_realm_add_bot_by_user_permissions").val(page_params.realm_add_bot_by_user_permissions);
    if (page_params.realm_add_bot_by_user_permissions ===
        page_params.bot_permissions_types.ADMINS_ONLY.code &&
        !page_params.is_admin) {
        $('#create_bot_form').hide();
        $('.add-a-new-bot-tab').hide();
        $('.account-api-key-section').hide();
        $("#bots_lists_navbar .active-bots-tab").click();
    } else {
        $('#create_bot_form').show();
        $('.add-a-new-bot-tab').show();
        $('.account-api-key-section').show();
    }
};

exports.set_up = function () {
    $('#payload_url_inputbox').hide();
    $('#create_payload_url').val('');
    $('#service_name_list').hide();
    $('#config_inputbox').hide();
    page_params.realm_embedded_bots.forEach(function (bot) {
        $('#select_service_name').append($('<option>', {
            value: bot.name,
            text: bot.name,
        }));
        _.each(bot.config, function (value, key) {
            var rendered_config_item = templates.render('embedded_bot_config_item',
                {botname: bot.name, key: key, value: value});
            $('#config_inputbox').append(rendered_config_item);
        });
    });
    var selected_embedded_bot = 'converter';
    $('#select_service_name').val(selected_embedded_bot); // TODO: Use 'select a bot'.
    $('#config_inputbox').children().hide();
    $("[name*='"+selected_embedded_bot+"']").show();

    $('#download_flaskbotrc').click(function () {
        var OUTGOING_WEBHOOK_BOT_TYPE_INT = 3;
        var content = "";
        $("#active_bots_list .bot-information-box").each(function () {
            var bot_info = $(this);
            var email = bot_info.find(".email .value").text();
            var api_key = bot_info.find(".api_key .api-key-value-and-button .value").text();
            var bot = bot_data.get(email);

            if (bot.bot_type === OUTGOING_WEBHOOK_BOT_TYPE_INT) {
                content += exports.generate_flaskbotrc_content(email, api_key);
            }
        });
        $(this).attr("href", "data:application/octet-stream;charset=utf-8," + encodeURIComponent(content));
    });

    // TODO: render bots xxxx
    render_bots();
    $(document).on('zulip.bot_data_changed', render_bots);

    $.validator.addMethod("bot_local_part",
                          function (value, element) {
                              return is_local_part.call(this, value + "-bot", element);
                          },
                          "Please only use characters that are valid in an email address");


    var create_avatar_widget = avatar.build_bot_create_widget();
    var OUTGOING_WEBHOOK_BOT_TYPE = '3';
    var GENERIC_BOT_TYPE = '1';
    var EMBEDDED_BOT_TYPE = '4';

    var GENERIC_INTERFACE = '1';

    $('#create_bot_form').validate({
        errorClass: 'text-error',
        success: function () {
            $('#bot_table_error').hide();
        },
        submitHandler: function () {
            var bot_type = $('#create_bot_type :selected').val();
            var full_name = $('#create_bot_name').val();
            var short_name = $('#create_bot_short_name').val() || $('#create_bot_short_name').text();
            var payload_url = $('#create_payload_url').val();
            var interface_type = $('#create_interface_type').val();
            var service_name = $('#select_service_name :selected').val();
            var formData = new FormData();

            formData.append('csrfmiddlewaretoken', csrf_token);
            formData.append('bot_type', bot_type);
            formData.append('full_name', full_name);
            formData.append('short_name', short_name);

            // If the selected bot_type is Outgoing webhook
            if (bot_type === OUTGOING_WEBHOOK_BOT_TYPE) {
                formData.append('payload_url', JSON.stringify(payload_url));
                formData.append('interface_type', interface_type);
            } else if (bot_type === EMBEDDED_BOT_TYPE) {
                formData.append('service_name', service_name);
                var config_data = {};
                $("[name*='"+service_name+"'] input").each(function () {
                    config_data[$(this).attr('name')] = $(this).val();
                });
                formData.append('config_data', JSON.stringify(config_data));
            }
            jQuery.each($('#bot_avatar_file_input')[0].files, function (i, file) {
                formData.append('file-'+i, file);
            });
            $('#create_bot_button').val('Adding bot...').prop('disabled', true);
            channel.post({
                url: '/json/bots',
                data: formData,
                cache: false,
                processData: false,
                contentType: false,
                success: function () {
                    $('#bot_table_error').hide();
                    $('#create_bot_name').val('');
                    $('#create_bot_short_name').val('');
                    $('#create_payload_url').val('');
                    $('#payload_url_inputbox').hide();
                    $('#config_inputbox').hide();
                    $("[name*='"+service_name+"'] input").each(function () {
                        $(this).val('');
                    });
                    $('#create_bot_type').val(GENERIC_BOT_TYPE);
                    $('#select_service_name').val('converter'); // TODO: Later we can change this to hello bot or similar
                    $('#service_name_list').hide();
                    $('#create_bot_button').show();
                    $('#create_interface_type').val(GENERIC_INTERFACE);
                    create_avatar_widget.clear();
                    $("#bots_lists_navbar .add-a-new-bot-tab").removeClass("active");
                    $("#bots_lists_navbar .active-bots-tab").addClass("active");
                },
                error: function (xhr) {
                    $('#bot_table_error').text(JSON.parse(xhr.responseText).msg).show();
                },
                complete: function () {
                    $('#create_bot_button').val('Create bot').prop('disabled', false);
                },
            });
        },
    });

    $("#create_bot_type").on("change", function () {
        var bot_type = $('#create_bot_type :selected').val();
        // For "generic bot" or "incoming webhook" both these fields need not be displayed.
        $('#service_name_list').hide();
        $('#select_service_name').removeClass('required');
        $('#config_inputbox').hide();

        $('#payload_url_inputbox').hide();
        $('#create_payload_url').removeClass('required');
        if (bot_type === OUTGOING_WEBHOOK_BOT_TYPE) {
            $('#payload_url_inputbox').show();
            $('#create_payload_url').addClass('required');

        } else if (bot_type === EMBEDDED_BOT_TYPE) {
            $('#service_name_list').show();
            $('#select_service_name').addClass('required');
            $("#select_service_name").trigger('change');
            $('#config_inputbox').show();
        }
    });

    $("#select_service_name").on("change", function () {
        $('#config_inputbox').children().hide();
        var selected_bot = $('#select_service_name :selected').val();
        $("[name*='"+selected_bot+"']").show();
    });

    $("#active_bots_list").on("click", "button.delete_bot", function (e) {
        var email = $(e.currentTarget).data('email');
        channel.del({
            url: '/json/bots/' + encodeURIComponent(email),
            success: function () {
                var row = $(e.currentTarget).closest("li");
                row.hide('slow', function () { row.remove(); });
            },
            error: function (xhr) {
                $('#bot_delete_error').text(JSON.parse(xhr.responseText).msg).show();
            },
        });
    });

    $("#inactive_bots_list").on("click", "button.reactivate_bot", function (e) {
        var email = $(e.currentTarget).data('email');

        channel.post({
            url: '/json/users/' + encodeURIComponent(email) + "/reactivate",
            error: function (xhr) {
                $('#bot_delete_error').text(JSON.parse(xhr.responseText).msg).show();
            },
        });
    });

    $("#active_bots_list").on("click", "button.regenerate_bot_api_key", function (e) {
        var email = $(e.currentTarget).data('email');
        channel.post({
            url: '/json/bots/' + encodeURIComponent(email) + '/api_key/regenerate',
            idempotent: true,
            success: function (data) {
                var row = $(e.currentTarget).closest("li");
                row.find(".api_key").find(".value").text(data.api_key);
                row.find("api_key_error").hide();
            },
            error: function (xhr) {
                var row = $(e.currentTarget).closest("li");
                row.find(".api_key_error").text(JSON.parse(xhr.responseText).msg).show();
            },
        });
    });

    var image_version = 0;

    var avatar_widget = avatar.build_bot_edit_widget($("#settings_page"));

    $("#active_bots_list").on("click", "button.open_edit_bot_form", function (e) {
        var users_list = people.get_realm_persons().filter(function (person)  {
            return !person.is_bot;
        });
        var li = $(e.currentTarget).closest('li');
        var edit_div = li.find('div.edit_bot');
        var form = $('#settings_page .edit_bot_form');
        var image = li.find(".image");
        var bot_info = li;
        var reset_edit_bot = li.find(".reset_edit_bot");
        var owner_select = $(templates.render("bot_owner_select", {users_list:users_list}));
        var old_full_name = bot_info.find(".name").text();
        var old_owner = bot_data.get(bot_info.find(".email .value").text()).owner;
        var bot_email = bot_info.find(".email .value").text();

        $("#settings_page .edit_bot .edit_bot_name").val(old_full_name);
        $("#settings_page .edit_bot .select-form").text("").append(owner_select);
        $("#settings_page .edit_bot .edit-bot-owner select").val(old_owner);
        $("#settings_page .edit_bot_form").attr("data-email", bot_email);
        $(".edit_bot_email").text(bot_email);

        avatar_widget.clear();


        function show_row_again() {
            image.show();
            bot_info.show();
            edit_div.hide();
        }

        reset_edit_bot.click(function (event) {
            form.find(".edit_bot_name").val(old_full_name);
            owner_select.remove();
            show_row_again();
            $(this).off(event);
        });

        var errors = form.find('.bot_edit_errors');

        form.validate({
            errorClass: 'text-error',
            success: function () {
                errors.hide();
            },
            submitHandler: function () {
                var email = form.attr('data-email');
                var full_name = form.find('.edit_bot_name').val();
                var bot_owner = form.find('.edit-bot-owner select').val();
                var file_input = $(".edit_bot").find('.edit_bot_avatar_file_input');
                var spinner = form.find('.edit_bot_spinner');
                var edit_button = form.find('.edit_bot_button');
                var formData = new FormData();

                formData.append('csrfmiddlewaretoken', csrf_token);
                formData.append('full_name', full_name);
                formData.append('bot_owner', bot_owner);
                jQuery.each(file_input[0].files, function (i, file) {
                    formData.append('file-'+i, file);
                });
                loading.make_indicator(spinner, {text: 'Editing bot'});
                edit_button.hide();
                channel.patch({
                    url: '/json/bots/' + encodeURIComponent(email),
                    data: formData,
                    cache: false,
                    processData: false,
                    contentType: false,
                    success: function (data) {
                        loading.destroy_indicator(spinner);
                        errors.hide();
                        edit_button.show();
                        show_row_again();
                        avatar_widget.clear();
                        typeahead_helper.clear_rendered_persons();

                        bot_info.find('.name').text(full_name);
                        if (data.avatar_url) {
                            // Note that the avatar_url won't actually change on the back end
                            // when the user had a previous uploaded avatar.  Only the content
                            // changes, so we version it to get an uncached copy.
                            image_version += 1;
                            image.find('img').attr('src', data.avatar_url+'&v='+image_version.toString());
                        }
                    },
                    error: function (xhr) {
                        loading.destroy_indicator(spinner);
                        edit_button.show();
                        errors.text(JSON.parse(xhr.responseText).msg).show();
                    },
                });
            },
        });


    });

    $("#active_bots_list").on("click", "a.download_bot_zuliprc", function () {
        var bot_info = $(this).closest(".bot-information-box");
        var email = bot_info.find(".email .value").text();
        var api_key = bot_info.find(".api_key .api-key-value-and-button .value").text();

        $(this).attr("href", exports.generate_zuliprc_uri(
            $.trim(email), $.trim(api_key)
        ));
    });

    $("#bots_lists_navbar .add-a-new-bot-tab").click(function (e) {
        e.preventDefault();
        e.stopPropagation();

        $("#bots_lists_navbar .add-a-new-bot-tab").addClass("active");
        $("#bots_lists_navbar .active-bots-tab").removeClass("active");
        $("#bots_lists_navbar .inactive-bots-tab").removeClass("active");
        $("#add-a-new-bot-form").show();
        $("#active_bots_list").hide();
        $("#inactive_bots_list").hide();
        $('#bot_table_error').hide();
    });

    $("#bots_lists_navbar .active-bots-tab").click(function (e) {
        e.preventDefault();
        e.stopPropagation();

        $("#bots_lists_navbar .add-a-new-bot-tab").removeClass("active");
        $("#bots_lists_navbar .active-bots-tab").addClass("active");
        $("#bots_lists_navbar .inactive-bots-tab").removeClass("active");
        $("#add-a-new-bot-form").hide();
        $("#active_bots_list").show();
        $("#inactive_bots_list").hide();
    });

    $("#bots_lists_navbar .inactive-bots-tab").click(function (e) {
        e.preventDefault();
        e.stopPropagation();

        $("#bots_lists_navbar .add-a-new-bot-tab").removeClass("active");
        $("#bots_lists_navbar .active-bots-tab").removeClass("active");
        $("#bots_lists_navbar .inactive-bots-tab").addClass("active");
        $("#add-a-new-bot-form").hide();
        $("#active_bots_list").hide();
        $("#inactive_bots_list").show();
        $('#bot_table_error').hide();
    });

};

return exports;
}());

if (typeof module !== 'undefined') {
    module.exports = settings_bots;
}
