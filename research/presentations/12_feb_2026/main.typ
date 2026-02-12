// Calmly-Touying Presentation Template
// A calm, modern presentation theme with Moloch-inspired design
//
// Documentation: https://github.com/YHan228/calmly-touying

#import "@preview/calmly-touying:0.1.0": *

// Configure your presentation
#show: calmly.with(
  config-info(
    title: [Delegating Deliberation to Agents],
    subtitle: [Cooperative AI Research Fellowship],
    author: [Joseph Low & Oscar Duys],
    date: datetime.today(),
    institution: [Mentor Meeting with Michiel],
  ),
)

// =============================================================================
// Title Slide
// =============================================================================

#title-slide()

// =============================================================================
// Slide 1: Limitations of the Habermas Machine
// =============================================================================

== Opportunities to Improve the Habermas Machine

#highlight-box(title: "Only 1 Round of Critique")[
  - Humans are expensive and get fatigued
  - The original paper runs just 1 round of opinion + 1 round of critique
  - This limits the depth of deliberation and convergence toward true consensus
]

#v(1em)

#highlight-box(title: "Relies on the PRM to Predict Rankings")[
  - A Preference Reward Model (PRM) predicts how participants would rank statements
  - Participants never actually rank the statements themselves
  - This introduces a bottleneck: the quality of consensus depends on how well the PRM approximates real human preferences
]

// =============================================================================
// Slide 2: What if we replaced humans with agents?
// =============================================================================

== What If Agents Deliberated Instead?

Replace human participants with *AI agents that represent humans*.

#v(0.5em)

#two-col(
  [
    *N Rounds of Critique*
    - Agents don't get fatigued or bored
    - Deliberation can continue for as many rounds as needed until genuine consensus emerges
    - 1M tokens ≈ \$5 --- far cheaper than human participants
  ],
  [
    *Bring Your Own Ranking*
    - Agents rank statements directly --- no PRM needed
    - Each agent provides its own authentic ranking based on its human's preferences
    - A more *decentralized* version of Habermas
  ],
)

// =============================================================================
// Slide 3: Habermolt & Habersim
// =============================================================================

== Our Approach: Habermolt & Habersim

#two-col(
  [
    #image("Habermolt.png", width: 70%)

    *Habermolt* is a product where humans send their agents to deliberate on their behalf.

    - Agents interview their humans to elicit preferences
    - Agents provide opinions, rankings, and critiques
    - Humans review the final consensus
  ],
  [
    #image("Habersim.png", width: 70%)

    *Habersim* is a research evaluation suite for multi-agent deliberation.

    - Synthetic personas for controlled experiments
    - Architecture-agnostic: explore different deliberation designs
    - Standardized evaluation for comparing architectures
  ],
)

// =============================================================================
// Slide 4: Overarching Research Question
// =============================================================================

== Does Habersim Correlate to Habermolt?

#alert-box(title: "Core Research Question")[
  _Do the mechanisms which maximise the Habersim scores also maximise the Habermolt scores?_
]

#v(0.5em)

If *yes*, this is extremely powerful:

- Research can focus on improving multi-agent deliberation within *Habersim* --- cheap, fast, reproducible
- Findings would *extend to real-world humans* via Habermolt
- The same deliberation architectures that work for synthetic agents would work for agents representing real people

#v(0.5em)

#highlight-box(title: "Why This Matters")[
  Habersim becomes a *laboratory* for deliberation research. We can rapidly iterate on architectures in simulation, then deploy the best ones to Habermolt with confidence that they will translate.
]

