angular.module('proton.utils')
    .service('eventManager', (
        $cookies,
        $rootScope,
        $state,
        $stateParams,
        $timeout,
        authentication,
        cache,
        cacheCounters,
        cachePages,
        CONSTANTS,
        Contact,
        desktopNotifications,
        Events,
        gettextCatalog,
        Label,
        notify,
        AppModel,
        labelsModel,
        sanitize,
        manageUser,
        $injector
    ) => {

        const { CONVERSATION_VIEW_MODE, INTERVAL_EVENT_TIMER, MAILBOX_IDENTIFIERS, STATUS } = CONSTANTS;
        const FIBONACCI = [1, 1, 2, 3, 5, 8];
        const { inbox, allDrafts, drafts, allSent, sent, trash, spam, allmail, archive, starred } = MAILBOX_IDENTIFIERS;
        const { DELETE, CREATE, UPDATE } = STATUS;
        const dispatch = (type, data = {}) => $rootScope.$emit('app.event', { type, data });
        const MODEL = {
            index: 0,
            milliseconds: INTERVAL_EVENT_TIMER
        };
        const closeNotifications = () => MODEL.notification && MODEL.notification.close();
        const setTimer = (timer = INTERVAL_EVENT_TIMER) => MODEL.milliseconds = timer;
        const manageID = (id = MODEL.ID) => MODEL.ID = id;
        const setEventID = (ID) => manageID(ID);
        const stop = () => {
            $timeout.cancel(MODEL.promiseCancel);
            delete MODEL.promiseCancel;
        };
        const manageActiveMessage = ({ Messages = [] }) => Messages.length && dispatch('activeMessages', { messages: _.pluck(Messages, 'Message') });
        const isDifferent = (eventID) => MODEL.ID !== eventID;

        /**
         * Clean contact datas
         * @param  {Object} contact
         * @return {Object}
         */
        function cleanContact(contact = {}) {
            contact.Name = sanitize.input(contact.Name);
            contact.Email = sanitize.input(contact.Email);
            return contact;
        }

        function get() {
            if (MODEL.ID) {
                return Events.get(MODEL.ID);
            }
            return Events.getLatestID();
        }

        const manageContacts = (events = []) => (events.length) && $rootScope.$emit('contacts', { type: 'contactEvents', data: { events } });

        function manageContactEmails(contactEmails = []) {
            contactEmails.forEach((contactEmail) => {
                const contactCleaned = cleanContact(contactEmail.ContactEmail);
                if (contactEmail.Action === DELETE) {
                    $rootScope.$emit('deleteContactEmail', contactEmail.ID);
                } else if (contactEmail.Action === CREATE) {
                    $rootScope.$emit('createContactEmail', contactCleaned);
                } else if (contactEmail.Action === UPDATE) {
                    $rootScope.$emit('updateContactEmail', contactEmail.ID, contactCleaned);
                }
            });
        }

        function manageMessageCounts(counts) {
            if (angular.isDefined(counts)) {
                const labelIDs = [inbox, allDrafts, drafts, allSent, sent, trash, spam, allmail, archive, starred].concat(labelsModel.ids());

                _.each(labelIDs, (labelID) => {
                    const count = _.findWhere(counts, { LabelID: labelID });

                    if (angular.isDefined(count)) {
                        cacheCounters.updateMessage(count.LabelID, count.Total, count.Unread);
                    } else {
                        cacheCounters.updateMessage(labelID, 0, 0);
                    }
                });

                $rootScope.$emit('messages.counter');
            }
        }

        function manageConversationCounts(counts) {
            if (angular.isDefined(counts)) {
                const labelIDs = [inbox, allDrafts, drafts, allSent, sent, trash, spam, allmail, archive, starred].concat(labelsModel.ids());

                _.each(labelIDs, (labelID) => {
                    const count = _.findWhere(counts, { LabelID: labelID });

                    if (angular.isDefined(count)) {
                        cacheCounters.updateConversation(count.LabelID, count.Total, count.Unread);
                    } else {
                        cacheCounters.updateConversation(labelID, 0, 0);
                    }
                });

            }
        }

        function manageThreadings(messages, conversations) {
            let events = [];

            if (angular.isArray(messages)) {
                events = events.concat(messages);
            }

            if (angular.isArray(conversations)) {
                events = events.concat(conversations);
            }

            if (events.length > 0) {
                cache.events(events, true);
            }
        }


        function manageDesktopNotifications(messages = []) {
            if (messages.length) {
                const threadingIsOn = authentication.user.ViewMode === CONVERSATION_VIEW_MODE;
                const { all } = labelsModel.get('map');

                const filterNotify = ({ LabelIDs = [] }) => {
                    return LabelIDs
                        .map((ID) => all[ID] || {})
                        .filter(({ Notify }) => Notify);
                };

                // @todo move them to the model itself
                // @todo rename constants to UPPERCASE
                all[inbox] = { Notify: 1, ID: inbox };
                all[starred] = { Notify: 1, ID: starred };

                _.each(messages, ({ Action, Message = {} }) => {
                    const onlyNotify = filterNotify(Message);

                    if (Action === 1 && Message.IsRead === 0 && onlyNotify.length) {
                        const [ { ID } ] = onlyNotify;
                        const route = `secured.${MAILBOX_IDENTIFIERS[ID] || 'label'}.element`;
                        const label = MAILBOX_IDENTIFIERS[ID] ? null : ID;
                        const title = gettextCatalog.getString('New mail from', null, 'Info') + ' ' + (Message.Sender.Name || Message.Sender.Address);

                        desktopNotifications.create(title, {
                            body: Message.Subject,
                            icon: '/assets/img/notification-badge.gif',
                            onClick() {
                                window.focus();

                                if (threadingIsOn) {
                                    return $state.go(route, { id: Message.ConversationID, messageID: Message.ID, label });
                                }

                                $state.go(route, { id: Message.ID, label });

                            }
                        });
                    }
                });
            }
        }

        function manageStorage(storage) {
            if (angular.isDefined(storage)) {
                authentication.user.UsedSpace = storage;
            }
        }

        function manageMembers(members) {
            members && dispatch('members', members);
        }

        function manageDomains(domains) {
            if (angular.isDefined(domains)) {
                _.each(domains, (domain) => {
                    if (domain.Action === DELETE) {
                        $rootScope.$emit('deleteDomain', domain.ID);
                    } else if (domain.Action === CREATE) {
                        $rootScope.$emit('createDomain', domain.ID, domain.Domain);
                    } else if (domain.Action === UPDATE) {
                        $rootScope.$emit('updateDomain', domain.ID, domain.Domain);
                    }
                });
            }
        }

        function manageOrganization(organization) {
            organization && $injector.get('organizationModel').set(organization);
        }

        function manageFilters(filters) {
            if (angular.isArray(filters)) {
                _.each(filters, (filter) => {
                    if (filter.Action === DELETE) {
                        $rootScope.$broadcast('deleteFilter', filter.ID);
                    } else if (filter.Action === CREATE) {
                        const simple = Sieve.fromTree(filter.Filter.Tree);
                        if (_.isEqual(filter.Filter.Tree, Sieve.toTree(simple))) {
                            filter.Filter.Simple = simple;
                        } else {
                            delete filter.Filter.Simple;
                        }
                        $rootScope.$broadcast('createFilter', filter.ID, filter.Filter);
                    } else if (filter.Action === UPDATE) {
                        const simple = Sieve.fromTree(filter.Filter.Tree);
                        if (_.isEqual(filter.Filter.Tree, Sieve.toTree(simple))) {
                            filter.Filter.Simple = simple;
                        } else {
                            delete filter.Filter.Simple;
                        }
                        $rootScope.$broadcast('updateFilter', filter.ID, filter.Filter);
                    }
                });
            }
        }

        function manageNotices(notices) {
            if (angular.isDefined(notices) && notices.length > 0) {
                // 2 week expiration
                const now = new Date();
                const expires = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14);
                const onClose = (name) => $cookies.put(name, 'true', { expires });

                for (let i = 0; i < notices.length; i++) {
                    const message = notices[i];
                    const cookieName = 'NOTICE-' + openpgp.util.hexidump(openpgp.crypto.hash.md5(openpgp.util.str2Uint8Array(message)));

                    if (!$cookies.get(cookieName)) {
                        notify({
                            message,
                            templateUrl: 'templates/notifications/cross.tpl.html',
                            duration: '0',
                            onClose: onClose(cookieName)
                        });
                    }
                }
            }
        }

        function manage(data) {
            manageNotices(data.Notices);

            if (data.Error) {
                return Events.getLatestID()
                    .then(({ data = {} }) => manageID(data.EventID));
            }

            if (data.Refresh === 1) {
                manageID(data.EventID);
                cache.reset();
                cachePages.clear();
                cacheCounters.reset();
                cache.callRefresh();
                cacheCounters.query();

                return authentication.fetchUserInfo()
                    .then(() => {
                        $rootScope.$broadcast('updateUser');
                        $rootScope.$emit('resetContactEmails');
                        $rootScope.$emit('contacts', { type: 'resetContacts' });
                        labelsModel.refresh();
                    });
            }

            if (data.Reload === 1) {
                window.location.reload();
                return Promise.resolve();
            }

            if (isDifferent(data.EventID)) {
                labelsModel.sync(data.Labels);
                manageContactEmails(data.ContactEmails);
                manageContacts(data.Contacts);
                manageThreadings(data.Messages, data.Conversations);
                manageDesktopNotifications(data.Messages);
                manageMessageCounts(data.MessageCounts);
                manageConversationCounts(data.ConversationCounts);
                manageStorage(data.UsedSpace);
                manageDomains(data.Domains);
                manageMembers(data.Members);
                manageOrganization(data.Organization);
                manageFilters(data.Filters);
                manageID(data.EventID);
                manageActiveMessage(data);

                return manageUser(data, call)
                    .then(() => {
                        if (data.More === 1) {
                            return call();
                        }
                    });
            }

            return Promise.resolve();
        }

        function reset() {
            $timeout.cancel(MODEL.promiseCancel);
            closeNotifications();
            interval();
        }

        function interval() {
            return get()
                .then(({ data = {} } = {}) => {
                    // Check for force upgrade
                    if (data.Code === 5003) {
                        // Force upgrade, kill event loop
                        $timeout.cancel(MODEL.promiseCancel);
                    } else {
                        closeNotifications();
                        MODEL.index = 0;
                        setTimer();
                        MODEL.promiseCancel = $timeout(interval, MODEL.milliseconds);
                        manage(data);
                    }
                    AppModel.set('onLine', true);
                },
                () => {
                    if (angular.isDefined(MODEL.promiseCancel)) {
                        $timeout.cancel(MODEL.promiseCancel);
                        closeNotifications();
                        /* eslint operator-assignment: "off" */
                        if (MODEL.index < (FIBONACCI.length - 1)) {
                            MODEL.index++;
                        }
                        setTimer(MODEL.milliseconds * FIBONACCI[MODEL.index]);
                        MODEL.promiseCancel = $timeout(interval, MODEL.milliseconds, false);
                        MODEL.notification = notify({ templateUrl: 'templates/notifications/retry.tpl.html', duration: '0', onClick: reset });
                        AppModel.set('onLine', false);
                    }
                }
                );
        }

        function start() {
            if (!MODEL.promiseCancel) {
                MODEL.promiseCancel = $timeout(interval, 0, false);
            }
        }

        function call() {
            return get()
                .then(({ data = {} } = {}) => {
                    AppModel.set('onLine', true);

                    if (data.Code === 1000) {
                        if (MODEL.index) {
                            closeNotifications();
                            setTimer();
                            MODEL.promiseCancel = $timeout(interval, MODEL.milliseconds);
                        }
                        return manage(data);
                    }

                    throw new Error(data.Error || 'Error event manager');
                });
        }

        return { setEventID, start, call, stop };
    });
