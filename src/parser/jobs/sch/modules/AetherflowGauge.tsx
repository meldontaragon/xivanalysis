import {t} from '@lingui/macro'
import {Trans} from '@lingui/react'
import ACTIONS from 'data/ACTIONS'
import JOBS from 'data/JOBS'
import STATUSES from 'data/STATUSES'
import {CastEvent} from 'fflogs'
import {dependency} from 'parser/core/Module'
import Combatants from 'parser/core/modules/Combatants'
import Cooldowns from 'parser/core/modules/Cooldowns'
import {Rule, Requirement} from 'parser/core/modules/Checklist'
import {CounterGauge, Gauge as CoreGauge} from 'parser/core/modules/Gauge'
import Suggestions, {SEVERITY, TieredSuggestion} from 'parser/core/modules/Suggestions'
import React from 'react'

import {ActionLink} from 'components/ui/DbLink'
import {getDataBy} from 'data'
import Module from 'parser/core/Module'
import React, {Fragment} from 'react'
import {Table, Grid} from 'semantic-ui-react'
import DISPLAY_ORDER from './DISPLAY_ORDER'

interface GaugeModifier {
	[key: string]: number | undefined
}

const AETHERFLOW_MODIFIERS = new Map<number, GaugeModifier>([
	// Builders
	[ACTIONS.AETHERFLOW.id, {cast: 3}],
	[ACTIONS.DISSIPATION.id, {cast: 3}],

	// Spenders
	[ACTIONS.LUSTRATE.id, {cast: -1}],
	[ACTIONS.INDOMITABILITY.id, {cast: -1}],
	[ACTIONS.EXCOGITATION.id, {cast: -1}],
	[ACTIONS.SACRED_SOIL.id, {cast: -1}],
	[ACTIONS.SCH_ENERGY_DRAIN.id, {cast: -1}],
])

const AETHERFLOW_USAGE_REDUCER = [
	ACTIONS.RECITATION.id,
]

const RECITATION_ACTIONS = [
	ACTIONS.SUCCOR.id,
	ACTIONS.INDOMITABILITY.id,
	ACTIONS.EXCOGITATION.id,
	ACTIONS.ADLOQUIUM.id,
]

const AETHERFLOW_USAGE_SERVERITY = {
	1: SEVERITY.MEDIUM,
	2: SEVERITY.MAJOR,
}


export class Gauge extends CoreGauge {
	static title = t('sch.gauge.title')`Aetherflow Gauge`

	@dependency private combatants!: Combatants
	@dependency private cooldowns!: Cooldowns
	@dependency private suggestions!: Suggestions

	private aetherflowGauge = this.add(new CounterGauge({
		chart: {label: 'Aetherflow Gauge', color: JOBS.SCHOLAR.colour},
	}))

	protected init() {
		super.init()

		this.addEventHook(
			'cast',
			{by: 'player', abilityId: Array.from(AETHERFLOW_MODIFIERS.keys())},
			this.onGaugeModifier,
		)
		this.addEventHook('complete', this.onComplete)
	}

	private onGaugeModifier(event: CastEvent) {
		const modifiers = AETHERFLOW_MODIFIERS.get(event.ability.guid) || {}

		let amount = modifiers[event.type] || 0

		// Recitation actions are free if Reecitation is active
		if (this.combatants.selected.hasStatus(STATUSES.RECITATION.id) && RECITATION_ACTIONS.includes(event.ability.guid) ) {
			amount = 0
		}

		this.aetherflowGauge.modify(amount)
	}

	private onComplete() {
		// Checklist rule for aetherflow cooldown
		this.checklist.add(new Rule({
			name: <Fragment><Trans id="sch.aetherflow.checklist.name">Use <ActionLink {...ACTIONS.AETHERFLOW} /> on cooldown.</Trans></Fragment>,
			description: <ul>
				<li><Trans id="sch.aetherflow.checklist.description-1">Using aetherflow on cooldown lets you regain mana faster.</Trans></li>
			</ul>,
			requirements: [
				new Requirement({
					name: <Fragment><Trans id="sch.aetherflow.checklist.requirement.uptime.name"><ActionLink {...ACTIONS.AETHERFLOW} /> cooldown uptime</Trans></Fragment>,
					percent: (this.cooldowns.getTimeOnCooldown(ACTIONS.AETHERFLOW.id) / this._durationWithAetherflowOnCooldown()) * 100,
				}),
				new Requirement({
					name: <Fragment><Trans id="sch.aetherflow.checklist.requirement.uses.name">Total <ActionLink {...ACTIONS.AETHERFLOW} /> casts: {this._totalAetherflowCasts} out of {this._possibleAetherflowCasts()} possible</Trans></Fragment>,
					percent: this._totalAetherflowCasts / this._possibleAetherflowCasts() * 100,
				}),
			],
		}))

		const {overCap} = this.beastGauge
		this.suggestions.add(new TieredSuggestion({
			icon: ACTIONS.INFURIATE.icon,
			content: <Trans id="war.gauge.suggestions.loss.content">
					Avoid letting your Beast Gauge overcap - the wasted resources may cost you uses of your spenders over the course of the fight.
			</Trans>,
			why: <Trans id="war.gauge.suggestions.loss.why">
				{overCap} beast gauge lost to an overcapped gauge.
			</Trans>,
			tiers: AETHERFLOW_USAGE_SERVERITY,
			value: overCap,
		}))
	}
}
