import LANDING_PAGE_HTML from './index.html'

import {shortUrlCacheMiddleware} from './middleware/shortUrlCache'
import {redirectShortUrl} from './handlers/redirectShortUrl'
import {siteFilterMiddleware} from './middleware/siteFilter'
import {turnstileMiddleware} from './middleware/turnstile'
import {createShortUrl} from './handlers/createShortUrl'
import {Router} from 'itty-router'

const router = Router()

// GET landing page html
router.get(
	'/',
	() =>
		new Response(LANDING_PAGE_HTML, {
			headers: {'Content-Type': 'text/html;charset=UTF-8'},
		}),
)

// GET redirects short URL to its original URL.
router.get('/:text', redirectShortUrl)

// POST creates a short URL that is associated with its an original URL.
router.post(
	'/api/url',
	turnstileMiddleware,
	shortUrlCacheMiddleware,
	siteFilterMiddleware,
	createShortUrl,
)

// All incoming requests are passed to the router where your routes are called and the response is sent.
addEventListener('fetch', e => {
	e.respondWith(router.handle(e.request, e))
})
