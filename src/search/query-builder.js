import transformPageText from 'src/util/transform-page-text'
import { DOMAIN_TLD_PATTERN, HASH_TAG_PATTERN } from 'src/overview/constants'
import { DEFAULT_TERM_SEPARATOR } from './util'

/**
 * @typedef IndexQuery
 * @type {Object}
 * @property {Set<string>} query Query terms a user has searched for.
 * @property {Set<string>} queryExclude Query terms a user has excluded from search.
 * @property {Set<string>} domain Set of domains a user has chosen to filter, or extracted from query.
 * @property {Set<string>} domainExclude Set of domains a user has chosen to filter-out, or extracted from query.
 * @property {Set<string>} tags Set of tags a user has chosen to filter, or extracted from query.
 * @property {Map<string, any>} timeFilter Map of different time filter ranges to apply to search.
 * @property {number} [skip=0]
 * @property {number} [limit=10]
 * @property {boolean} [isBadTerm=false] Flag denoting whether or not searched query is not specific enough.
 */

class QueryBuilder {
    // Pattern to match entire string to `domain.tld`-like format + optional subdomain prefix and ccTLD postfix
    static DOMAIN_TLD_PATTERN = DOMAIN_TLD_PATTERN

    // Pattern to match hashtags - spaces can be represented via '+'
    static HASH_TAG_PATTERN = HASH_TAG_PATTERN
    static EXCLUDE_PATTERN = /^-\w+/

    /**
     * Slice off '#' prefix and replace any '+' with space char
     *
     * @param {string} tag
     * @return {string}
     */
    static stripTagPattern = tag =>
        tag
            .slice(1)
            .split('+')
            .join(' ')

    /**
     * Splits up an input string into terms.
     *
     * @param {string} input
     * @param {string|RegExp} [delim]
     * @return {string[]}
     */
    static getTermsFromInput = (input, delim = DEFAULT_TERM_SEPARATOR) =>
        input
            .toLowerCase()
            .trim()
            .split(delim)

    skip = 0
    limit = 10
    query = new Set()
    queryExclude = new Set()
    timeFilter = new Map()
    domain = new Set()
    domainExclude = new Set()
    tags = new Set()
    isBadTerm = false
    showOnlyBookmarks = false

    /**
     * @returns {IndexQuery}
     * @memberof QueryBuilder
     */
    get = () => ({
        query: this.query,
        queryExclude: this.queryExclude,
        limit: this.limit,
        skip: this.skip,
        domain: this.domain,
        domainExclude: this.domainExclude,
        tags: this.tags,
        isBadTerm: this.isBadTerm,
        timeFilter: this.timeFilter,
        bookmarksFilter: this.showOnlyBookmarks,
    });

    skipUntil(skip) {
        this.skip = skip
        return this
    }

    limitUntil(limit) {
        this.limit = limit
        return this
    }

    bookmarksFilter(showOnlyBookmarks) {
        this.showOnlyBookmarks = showOnlyBookmarks
        return this
    }

    filterTime({ startDate, endDate }, keyType) {
        if (!startDate && !endDate) {
            this.timeFilter.set('blank', true)
        }

        const existing = this.timeFilter.get(keyType) || {}
        this.timeFilter.set(keyType, {
            ...existing,
            gte: startDate ? `${keyType}${startDate}` : keyType,
            lte: endDate ? `${keyType}${endDate}` : `${keyType}\uffff`,
        })

        return this
    }

    filterTags(data) {
        data.forEach(tag => this.tags.add(tag))
        return this
    }

    filterDomains(domains = []) {
        for (const domain of domains) {
            this.domain.add(domain)
        }

        return this
    }

    filterExcDomains(domains = []) {
        for (const domain of domains) {
            this.domainExclude.add(domain)
        }

        return this
    }

    /**
     * Filter out terms those terms that match any tags/domain pattern from an array of terms.
     * Contains side-effects to update `domains` and `tags` Sets with anything found.
     */
    _extractTermsPatterns(termsArr = []) {
        const terms = { exclude: [], include: [] }

        for (let term of termsArr) {
            const isExclusive = QueryBuilder.EXCLUDE_PATTERN.test(term)

            if (isExclusive) {
                term = term.slice(1)
            }

            if (QueryBuilder.DOMAIN_TLD_PATTERN.test(term)) {
                this[isExclusive ? 'domainExclude' : 'domain'].add(term)
                continue
            }

            if (QueryBuilder.HASH_TAG_PATTERN.test(term)) {
                this.tags.add(QueryBuilder.stripTagPattern(term))
                continue
            }

            terms[isExclusive ? 'exclude' : 'include'].push(term)
        }

        return terms
    }

    searchTerm(input = '') {
        // Short-circuit if blank search
        if (!input.trim().length) {
            return this
        }

        // STAGE 1: Filter out tags/domains
        const terms = QueryBuilder.getTermsFromInput(input, /\s+/)
        const { include, exclude } = this._extractTermsPatterns(terms)

        // Short-circuit if all terms filtered out as tags/domains
        if (!include.length && !exclude.length) {
            return this
        }

        // STAGE 2: push through index text-processing logic
        let { text: textInclude } = transformPageText({
            text: include.join(' '),
        })
        let { text: textExclude } = transformPageText({
            text: exclude.join(' '),
        })

        textInclude = textInclude.trim()
        textExclude = textExclude.trim()

        // Search is too vague if nothing left from text-processing
        if (!textInclude.length && !textExclude.length) {
            this.isBadTerm = true
            return this
        }

        if (textInclude.length) {
            // Add post-processed terms to `query` Set
            QueryBuilder.getTermsFromInput(textInclude).forEach(term =>
                this.query.add(term),
            )
        }

        if (textExclude.length) {
            QueryBuilder.getTermsFromInput(textExclude).forEach(term =>
                this.queryExclude.add(term),
            )
        }

        return this
    }
}

export default QueryBuilder
