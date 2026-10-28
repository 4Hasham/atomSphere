# atomSphere: Marketing Recommendations

*Written 2026-10-28. Works alongside `plan.md` (Section 5, Go-to-Market); the `#n` numbers refer to `mvp.csv` milestones.*

## 1. The Short Version
* **The tech alone is not the moat.** Floorplan → 3D exists elsewhere (Floorplanner, RoomSketcher, Planner 5D, Cedreo, Coohom), and text/photo → 3D is a thin layer over Hunyuan3D and Meshy. A skilled developer with AI could rebuild the Studio in weeks to months.
* **What can be defended:** fit with the Pakistani market (local construction details, off-plan buying, WhatsApp, PKR payments), a growing **library of society house designs**, fast turnaround, and relationships with the first customers.
* **The next month goes to selling, not building.** Build only what a paying customer asks for.

---

## 2. What the Market Does Today
* **Big developers and new societies already pay for 3D:** still renders, flythrough videos and walkthroughs for brochures, websites and Facebook ads, outsourced to local arch-viz studios or freelancers (e.g. [Sohni Saiban](https://architizer.com/projects/sohni-saiban/), [GravityCGI](https://linkedin.com/company/gravitycgi)).
* **Zameen** has run [VR walkthroughs at Property Open Day](https://www.zameen.com/news/zameen-com-successfully-concludes-open-day-event.html) and sells [Zameen Property Tours](https://www.zameen.com/blog/zameen-property-tour-services.html) (hosted video, not interactive 3D).
* **Rare today:** 3D for **individual houses and listings**, anything **interactive** (walk inside, see floors, check room sizes), and small agencies making 3D themselves. They reuse developer renders or post phone photos and a floorplan JPG.
* **Freelance rates:** Pakistani 3D freelancers list about [$10–17/hr](https://www.upwork.com/hire/3d-rendering-artists/pk/lahore/). Indian studios quote about [₹8,000–15,000 per basic exterior view](https://peninsularartworks.com/blogs/3d-architectural-rendering-cost-in-india-2026-pricing-guide). No published per-render prices for Pakistan were found, so ask (Section 6).

**Takeaway:** people already pay for 3D, so you don't have to prove it matters. The gap is **per house, interactive, cheap, fast and shareable on WhatsApp**.

---

## 3. Positioning
* **One line:** *"See the house before you buy it. An explorable 3D house from the floorplan, on its real plot, sent as a WhatsApp link."*
* **Lead with property mode.** Object generation becomes "add furniture and props to your property", not the headline (already noted in `plan.md` §1).
* **The real competitor is a local render freelancer**, not a global platform. They produce more photoreal stills than a browser can show. Win on:
  1. **Speed:** days, not weeks.
  2. **Interactive:** walk inside, one floor at a time, real sizes, on a phone.
  3. **Price per listing:** low enough to use on every house, not just flagship projects.
* **Show the result, not the method.** Customers see the house and the link. Never mention Modal, Hunyuan, R3F or AWS in sales material.

---

## 4. Who to Sell To (in order)

| Priority | Segment | Why them | Pitch |
| :--- | :--- | :--- | :--- |
| **1** | **Housing society developers** | Biggest budgets, many repeats of a few standard designs (5 marla, 10 marla, 1 kanal), sell off-plan | "Your flythrough shows the society. We show every house design inside it, explorable on the buyer's phone." |
| **2** | **Real estate marketing agencies** (Sky Marketing, Zavyans, Ghafari) | Share listings on WhatsApp all day; reuse developer renders | "A 3D link for each listing, ready in days." |
| **3** | **Overseas Pakistani (NRP) buyers and portals** | Can't visit; worry about fraud and size | "Check the layout, size and plot before sending money." |
| 4 | Architecture / interior studios | Quick client previews | "From plan to an explorable 3D model in an afternoon." Lower priority; they already have SketchUp / Lumion. |

---

## 5. Before the First Outreach (minimum build)
Only these, then stop and sell:
1. **Save and share a property as a link** (#52 + the share-link part of #17).
2. **First-person walkthrough** (#53), even a basic one.
3. **One proper exterior finish** (paint + stone cladding, part of #55) so the house doesn't look like grey boxes.
4. **3 demo properties** (#6): real 10-marla / 1-kanal designs from target societies, on real terrain.
5. **A 15-second clip** (#7) of one demo, recorded on a phone.

**Pause until someone pays:** weather telemetry (#21), MCP server (Phase 8), Google 3D Tiles (#15, #16), AR weather, new object-generation features.

---

## 6. Outreach Playbook (introvert-friendly)

### Order of contact
1. **People you already know:** relatives or family friends who are agents, bought in a society, or live abroad and invested back home. Aim for 3–5 conversations.
2. **WhatsApp first, meetings second.** Send the clip with two lines, e.g. *"I made this from a 10-marla floorplan. Would something like this help you sell to overseas buyers?"* Replies can wait; so can yours.
3. **Then agencies and developers** (plan §5 targets), ideally through an introduction from step 1.

### In a meeting
* **Hand them the phone** with the 3D house open. Let it start the conversation.
* **Keep questions written on your phone.** Reading them is normal.
* **Bring someone along** to the first few meetings if it helps. Longer term, consider a sales-minded partner: you build, they sell.

### Questions to ask (learn, don't pitch)
1. How do you show buyers a house that isn't built yet, or that they can't visit?
2. Who makes your renders or videos? How much do they cost, and how long do they take?
3. What do buyers, especially overseas buyers, complain about or ask most often?
4. *(After the demo)* Would you use this for your listings? What's missing?
5. What would you pay per house, or per month, for this?

### Weekly goal
Small and fixed: **at least one new conversation per week**, logged with what they said.

---

## 7. Pricing (to test, not decided)
* Current `plan.md` §4 prices only object generation ($3 / $5). **The headline product needs its own price.**
* Test three models in conversations:
  * **Per listing:** one house, one link.
  * **Per design + cheap reuse:** a society design traced once, then a small fee per extra listing that uses it.
  * **Monthly:** for agencies, N listings a month.
* **Anchor against what they pay now** for renders (question 2 above), and stay well below it.
* **Price below the cost of copying.** If a listing costs less than a day of their staff's time, building their own makes no sense.
* **Free offer:** 3 listings free (`plan.md` §5), then ask for payment on the 4th. Agree on this up front.

---

## 8. Protecting the Idea
* **Customers rarely build it themselves.** Agencies sell property; they already buy renders rather than learn SketchUp.
* **The real risks** are Zameen or a large developer with an IT team. They tend to move slowly and often prefer to partner with or buy a team that has proven something.
* **Defences:** move fast, stay close to customers (WhatsApp support, fixes within a week), keep pricing below the cost of copying, and **build the society design library**. Each traced design makes the next listing cheaper for you, and a newcomer starts at zero.
* **Hiding the idea costs more than sharing it.** If nobody sees it, nobody pays.

---

## 9. Licence Watch-out
* The Hunyuan3D licence bars showing outputs in the **EU, UK and South Korea** (`plan.md` Phase 1). The **UK has one of the largest overseas Pakistani communities.**
* The house itself is built by our own 3D builder, so it's fine. **Hunyuan-generated props staged in a scene shown to a UK buyer are not.**
* Fix: use Meshy (Polished) for props in anything aimed at overseas buyers, or block Hunyuan props for viewers in those regions.

---

## 10. How to Know It's Working
| Signal | What it means | Next step |
| :--- | :--- | :--- |
| Agents ask "how much?" or "can you do this one?" | Real interest | Do the 3 free listings, then charge |
| Free listings get more enquiries than usual | Value proven | Get a quote or testimonial; price it |
| First payment (any amount) | Business, not a hobby | Build what that customer asks for next |
| Polite "nice" but no follow-up after 10+ conversations | Wrong segment or pitch | Switch segment (try developers vs agencies) or change the offer |

---

## Sources
* [Sohni Saiban – Architizer](https://architizer.com/projects/sohni-saiban/)
* [GravityCGI – LinkedIn](https://linkedin.com/company/gravitycgi)
* [Zameen property tour services](https://www.zameen.com/blog/zameen-property-tour-services.html)
* [Zameen.com Open Day event](https://www.zameen.com/news/zameen-com-successfully-concludes-open-day-event.html)
* [Upwork – 3D rendering artists in Lahore](https://www.upwork.com/hire/3d-rendering-artists/pk/lahore/)
* [3D rendering cost in India 2026](https://peninsularartworks.com/blogs/3d-architectural-rendering-cost-in-india-2026-pricing-guide)
