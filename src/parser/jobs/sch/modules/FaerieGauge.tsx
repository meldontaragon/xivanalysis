import {t} from '@lingui/macro'
import {Trans} from '@lingui/react'
import {ActionLink} from 'components/ui/DbLink'
import {getDataBy} from 'data'
import ACTIONS from 'data/ACTIONS'
import JOBS from 'data/JOBS'
import STATUSES from 'data/STATUSES'
import {CastEvent, HealEvent} from 'fflogs'
import {dependency} from 'parser/core/Module'
import Combatants from 'parser/core/modules/Combatants'
import Cooldowns from 'parser/core/modules/Cooldowns'
import {CounterGauge, Gauge as CoreGauge} from 'parser/core/modules/Gauge'
import Suggestions, {SEVERITY, TieredSuggestion} from 'parser/core/modules/Suggestions'
import React from 'react'

interface GaugeModifier {
	[key: string]: number | undefined
}

// Actions that generate fairy gauge
const FAERIE_MODIFIERS = new Map<number, GaugeModifier>([
	// Generators
	[ACTIONS.SCH_ENERGY_DRAIN.id, {cast: 10}],
	[ACTIONS.LUSTRATE.id, {cast: 10}],
	[ACTIONS.INDOMITABILITY.id, {cast: 10}],
	[ACTIONS.SACRED_SOIL.id, {cast: 10}],
	[ACTIONS.EXCOGITATION.id, {cast: 10}],

	// Spenders
	[ACTIONS.FEY_BLESSING.id, {cast: -10}],
	[ACTIONS.FEY_UNION.id, {cast: -10}],
	[STATUSES.FEY_UNION.id, {heal: -10}],
	// potential issue: FEY_UNION actually spends more if it's kept up (10 gauge per tick)
])

// Severity markers for overcap
// Wasting gauge is a relatively small loss as the two abilities it can be spent on are fairly low potency and typically should only be used if you have a free weave slot
const GAUGE_WASTE_SEVERITY = {
	50: SEVERITY.MINOR,
}

const SUMMON_ACTIONS = [
	ACTIONS.SUMMON_EOS.id,
	ACTIONS.SUMMON_SELENE.id,
]

export class FaerieGauge extends CoreGauge {
	static title = t('sch.gauge.title')`Faerie Gauge Usage`

	@dependency private combatants!: Combatants
	@dependency private suggestions!: Suggestions

	private faerieGauge = this.add(new CounterGauge({
		chart: {label: 'Faerie Gauge', color: JOBS.SCHOLAR.colour},
	}))
	private _fairyOut = false

	protected init() {
		super.init()

		this.addEventHook(
			['cast', 'heal'],
			{by: ['player', 'pet'], abilityId: Array.from(FAERIE_MODIFIERS.keys())},
			this.onGaugeModifier,
		)
		this.addEventHook('complete', this.onComplete)
		this.addEventHook(
			'cast',
			{by: 'player', abilityId: SUMMON_ACTIONS},
			this.onSummon,
		)
	}

	// Search through the events to figure out if there was a fairy out before logs started
	normalise(events) {
		for (const event of events) {
			if (!event.ability) { continue }

			const action = getDataBy(ACTIONS, 'id', event.ability.guid)
			if (!action) { continue }

			const pet = this.parser.report.friendlyPets.find(pet => pet.id === event.sourceID)
				|| {petOwner: -1}

			// Ignore events that aren't related to your fairy
			if (
				event.type !== 'cast' ||
				!event.sourceIsFriendly ||
				pet.petOwner !== this.parser.player.id ||
				!action.pet
			) { continue }

			// Fairy found
			this._fairyOut = true
			break
		}

		return events
	}

	onSummon() {
		this._fairyOut = true
	}

	onGaugeModifier(event: CastEvent | HealEvent) {
		const modifiers = FAERIE_MODIFIERS.get(event.ability.guid) || {}

		let amount = modifiers[event.type] || 0

		// can only generate gauge if you have a Faerie out
		if (this.combatants.selected.hasStatus(STATUSES.DISSIPATION.id) || ! this._fairyOut) {
			amount = 0
		}
		this.faerieGauge.modify(amount)
	}

	_onDeath() {
		this._fairyOut = false
	}

	private onComplete() {

		// Suggest that they use their gauge consumers at certain overcap points
		const {overCap} = this.faerieGauge
		this.suggestions.add(new TieredSuggestion({
			icon: ACTIONS.FEY_BLESSING.icon,
			tiers: GAUGE_WASTE_SEVERITY,
			value: overCap,
			content: <Trans id="sch.gauge.waste.suggestion.content">Try to make use of your Faerie Gauge abilities <ActionLink {...ACTIONS.FEY_UNION}/> and <ActionLink {...ACTIONS.FEY_BLESSING}/>, since they are free oGCD heals that come naturally from using Aetherflow abilities.</Trans>,
			why: <Trans id="sch.gauge.waste.suggestion.why">A total of {overCap} gauge was lost due to exceeding the cap.</Trans>,
		}))
	}
}
