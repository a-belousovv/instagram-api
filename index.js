const { chromium } = require('playwright')
const { Worker, isMainThread, workerData } = require('worker_threads')
const winston = require('winston')
const fs = require('fs')
const path = require('path')

// Настройка логгера
const logger = winston.createLogger({
	level: 'info',
	format: winston.format.combine(
		winston.format.timestamp(),
		winston.format.json()
	),
	transports: [new winston.transports.File({ filename: 'bot.log' })],
})

class InstagramBot {
	constructor(account, proxy) {
		this.account = account
		this.proxy = proxy
		this.limits = {
			dailyLikes: 100,
			dailyComments: 50,
			dailyStories: 200,
		}
		this.sessionPath = path.join(
			__dirname,
			'sessions',
			`${this.account.username}.json`
		)
	}

	async initBrowser() {
		this.browser = await chromium.launch({
			headless: false,
			proxy: {
				server: this.proxy,
				username: this.account.proxyUser,
				password: this.account.proxyPass,
			},
		})
		this.context = await this.browser.newContext({
			userAgent:
				'Mozilla/5.0 (iPhone; CPU iPhone OS 15_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.4 Mobile/15E148 Safari/604.1',
			viewport: { width: 375, height: 812 },
		})
		this.page = await this.context.newPage()
	}

	async login() {
		try {
			if (fs.existsSync(this.sessionPath)) {
				const cookies = JSON.parse(fs.readFileSync(this.sessionPath))
				await this.context.addCookies(cookies)
				await this.page.goto('https://www.instagram.com/')
				await this.page.waitForTimeout(5000)

				if (await this.page.$('input[name="username"]')) {
					throw new Error('Session expired')
				}
				logger.info(`Session restored for ${this.account.username}`)
			} else {
				await this.page.goto('https://www.instagram.com/accounts/login/')
				await this.page.waitForSelector('input[name="username"]')

				await this.page.type('input[name="username"]', this.account.username)
				await this.page.type('input[name="password"]', this.account.password)
				await this.page.click('button[type="submit"]')

				await this.page.waitForNavigation()
				await this.page.waitForTimeout(10000)

				const cookies = await this.context.cookies()
				fs.writeFileSync(this.sessionPath, JSON.stringify(cookies))
				logger.info(`Logged in successfully: ${this.account.username}`)
			}
		} catch (error) {
			logger.error(
				`Login failed for ${this.account.username}: ${error.message}`
			)
			throw error
		}
	}

	async emulateActivity() {
		try {
			// Эмуляция скроллинга ленты
			for (let i = 0; i < 10; i++) {
				await this.page.evaluate(() => window.scrollBy(0, window.innerHeight))
				await this.page.waitForTimeout(this.randomDelay(2000, 5000))

				// Случайный лайк
				if (Math.random() < 0.3) {
					await this.likePost()
				}

				// Случайный просмотр сторис
				if (Math.random() < 0.2) {
					await this.watchStory()
				}
			}
		} catch (error) {
			logger.error(`Activity error: ${error.message}`)
		}
	}

	async likePost() {
		const likeButtons = await this.page.$$('svg[aria-label="Like"]')
		if (likeButtons.length > 0) {
			const button = likeButtons[Math.floor(Math.random() * likeButtons.length)]
			await button.click()
			await this.page.waitForTimeout(this.andomDelay(1000, 3000))
			logger.info(`Liked post for ${this.account.username}`)
		}
	}

	async watchStory() {
		const storyElements = await this.page.$$(
			'div[role="button"] > div[tabindex="0"]'
		)
		if (storyElements.length > 0) {
			const story =
				storyElements[Math.floor(Math.random() * storyElements.length)]
			await story.click()
			await this.page.waitForTimeout(this.randomDelay(5000, 10000))
			logger.info(`Watched story for ${this.account.username}`)
		}
	}

	randomDelay(min, max) {
		return Math.floor(Math.random() * (max - min + 1)) + min
	}

	async run() {
		try {
			await this.initBrowser()
			await this.login()
			await this.emulateActivity()
		} catch (error) {
			logger.error(`Fatal error for ${this.account.username}: ${error.message}`)
		} finally {
			logger.info(`Closing browser for ${this.account.username}`)
			await this.browser.close()
		}
	}
}

// Запуск воркеров для параллельной обработки
if (isMainThread) {
	const accounts = [
		{
			username: 'user1',
			password: 'pass1',
			proxy: 'http://proxy1.com:port',
			proxyUser: 'user',
			proxyPass: 'pass',
		},
		// Добавьте другие аккаунты
	]

	accounts.forEach(account => {
		const worker = new Worker(__filename, {
			workerData: account,
		})
	})
} else {
	const bot = new InstagramBot(workerData, workerData.proxy)
	bot.run()
}
