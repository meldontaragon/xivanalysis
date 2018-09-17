import {Trans, Plural, i18nMark} from '@lingui/react'
import React, {Fragment} from 'react'
import {Accordion, Message} from 'semantic-ui-react'

import {ActionLink} from 'components/ui/DbLink'
import Rotation from 'components/ui/Rotation'
import ACTIONS, {getAction} from 'data/ACTIONS'
import STATUSES from 'data/STATUSES'
import Module from 'parser/core/Module'
import {TieredSuggestion, SEVERITY} from 'parser/core/modules/Suggestions'

const WILDFIRE_DAMAGE_FACTOR = 0.25

const WILDFIRE_GCD_TARGET = 5
const WILDFIRE_GCD_WARNING = 4
const WILDFIRE_GCD_ERROR = 0

const NON_OVERHEATED_GCD_THRESHOLD = 2

export default class Wildfire extends Module {
	static handle = 'wildfire'
	static i18n_id = i18nMark('mch.wildfire.title')
	static title = 'Wildfire'
	static dependencies = [
		'enemies',
		'heat',
		'suggestions',
	]

	_wildfireWindows = {
		current: null,
		history: [],
	}

	constructor(...args) {
		super(...args)
		this.addHook('damage', {by: 'player'}, this._onDamage)
		this.addHook('damage', {by: 'player', abilityId: STATUSES.WILDFIRE.id}, this._onWildfireDamage)
		this.addHook('applydebuff', {by: 'player', abilityId: STATUSES.WILDFIRE.id}, this._onWildfireApplied)
		this.addHook('complete', this._onComplete)
	}

	_onDamage(event) {
		const target = this.enemies.getEntity(event.targetID)
		if (target && target.hasStatus(STATUSES.WILDFIRE.id) && // Target has WF on them
			this._wildfireWindows.current !== null && // And we're in a WF window (in case there are multiple MCHs)
			this._wildfireWindows.current.targetId === event.targetID) { // And we're hitting the WF-afflicted target
			const currentDamage = this._wildfireWindows.current.casts.length > 0 ? this._wildfireWindows.current.casts[this._wildfireWindows.current.casts.length - 1].compoundDamage : 0
			this._wildfireWindows.current.casts.push({
				...event,
				overheated: this.heat.overheated, // Slap this on everything for simplicity, we can ignore it for OGCDs when evaluating
				compoundDamage: currentDamage + Math.floor(event.amount * WILDFIRE_DAMAGE_FACTOR),
			})
		}
	}

	_onWildfireDamage(event) {
		this._wildfireWindows.current.casts = this._wildfireWindows.current.casts.filter(cast => cast.compoundDamage <= event.amount) // Pop any extraneous events off the end
		const gcds = this._wildfireWindows.current.casts.filter(cast => getAction(cast.ability.guid).onGcd)
		this._wildfireWindows.current.gcdCount = gcds.length
		this._wildfireWindows.current.overheatedGcdCount = gcds.filter(cast => cast.overheated).length
		this._wildfireWindows.current.damage = event.amount
		this._wildfireWindows.history.push(this._wildfireWindows.current)
		this._wildfireWindows.current = null
	}

	_onWildfireApplied(event) {
		this._wildfireWindows.current = {
			start: event.timestamp,
			casts: [],
			targetId: event.targetID,
		}
	}

	_onComplete() {
		const badWildfires = this._wildfireWindows.history.filter(wildfire => wildfire.gcdCount - wildfire.overheatedGcdCount >= NON_OVERHEATED_GCD_THRESHOLD).length
		this.suggestions.add(new TieredSuggestion({
			icon: ACTIONS.WILDFIRE.icon,
			content: <Trans id="mch.wildfire.suggestions.cooldown.content">
				Try to align your <ActionLink {...ACTIONS.WILDFIRE}/> windows as closely as possible with your overheat windows to maximize damage. Casting Wildfire too early or too late can cost you significant damage gains from heated shots and the 20% damage buff from overheating.
			</Trans>,
			tiers: {
				1: SEVERITY.MEDIUM, // TODO - Tiers
				3: SEVERITY.MAJOR,
			},
			value: badWildfires,
			why: <Trans id="mch.wildfire.suggestions.cooldown.why">
				{badWildfires} of your Wildfire windows contained at least {NON_OVERHEATED_GCD_THRESHOLD} non-overheated GCDs.
			</Trans>,
		}))
	}

	_formatGcdCount(count) {
		if (count === WILDFIRE_GCD_ERROR) {
			return <span className="text-error">{count}</span>
		}

		if (count <= WILDFIRE_GCD_WARNING) {
			return <span className="text-warning">{count}</span>
		}

		return count
	}

	output() {
		const panels = this._wildfireWindows.history.map(wildfire => {
			return {
				title: {
					key: 'title-' + wildfire.start,
					content: <Fragment>
						{this.parser.formatTimestamp(wildfire.start)}
						<span> - </span>
						<Trans id="mch.wildfire.panel-count">
							{this._formatGcdCount(wildfire.gcdCount)} <Plural value={wildfire.gcdCount} one="GCD" other="GCDs"/>, {wildfire.damage} damage
						</Trans>
					</Fragment>,
				},
				content: {
					key: 'content-' + wildfire.start,
					content: <Rotation events={wildfire.casts}/>,
				},
			}
		})

		return <Fragment>
			<Message>
				<Trans id="mch.wildfire.accordion.message">Every <ActionLink {...ACTIONS.WILDFIRE}/> window should ideally contain at least {WILDFIRE_GCD_TARGET} GCDs and as many OGCDs as you can weave. Each Wildfire window below indicates how many GCDs it contained and the total damage it hit for, and will display all the damaging casts in the window if expanded.</Trans>
			</Message>
			<Accordion
				exclusive={false}
				panels={panels}
				styled
				fluid
			/>
		</Fragment>
	}
}
