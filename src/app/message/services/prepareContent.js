angular.module('proton.message')
    .factory('prepareContent', ($injector, transformAttachements, transformRemote, transformEscape, transformEmbedded) => {

        const filters = [
            'transformBase',
            'transformLinks',
            'transformEmbedded',
            'transformWelcome',
            'transformBlockquotes',
            'transformStylesheet'
        ].map((name) => ({ name, action: $injector.get(name) }));

        /**
     * Get the list of transoformation to perform
     *     => Blacklist everything via *
     * @param  {Array}  blacklist
     * @return {Array}
     */
        const getTransformers = (blacklist = []) => {
            if (blacklist.includes('*')) {
                return [];
            }
            return filters.filter(({ name }) => !blacklist.includes(name));
        };

        function createParser(content, message, { isBlacklisted = false, action }) {
            const div = document.createElement('div');

            if (isBlacklisted) {
                div.innerHTML = content;
                return div;
            }

            // Escape All the things !
            return transformEscape(div, message, {
                action, content
            });
        }

        return (content, message, { blacklist = [], action } = {}) => {

            const transformers = getTransformers(blacklist);
            const div = createParser(content, message, {
                action,
                isBlacklisted: _.contains(blacklist, 'transformRemote')
            });

            const body = transformers.reduceRight((html, transformer) => transformer.action(html, message, action), div);

            if (!blacklist.includes('*') && !_.contains(blacklist, 'transformAttachements')) {
                transformAttachements(body, message, action);
            }

            // For a draft we try to load embedded content if we can
            /^reply|forward/.test(action) && transformEmbedded(body, message, action);
            return transformRemote(body, message, { action }).innerHTML;
        };
    });
