"""Authoring source for fixtures/acceptance-v12/*/expected.facts.json and the curated
regression facts (tests/acceptance/curated.facts.json). Run: python3 tests/acceptance/generate-facts.py
status: 'current' = must hold today; 'target:Pn' = required by the spec phase n, expected to fail today."""
import json, os
Q = "Does Spatial understand this because its runtime model is generic?"
def F(id, kind, status, req=None, **kw):
    d = {"id": id, "kind": kind, "status": status}
    if req: d["requirement"] = req
    d.update(kw); return d
C = "current"
P = {}
P["acc01-clinic-maven"] = dict(id="ACC-1", title="Clinic appointment scheduler (Maven, multi-class business app)", renames={
 "Clinic":"Ward7","Scheduler":"Planner7","Doctor":"Medic7","Patient":"Client7","Slot":"Booking7","Invoice":"Bill7","bookVisit":"reserve7","billFor":"charge7",
 "visitFee":"price7","reschedule":"move7","acceptVisit":"admit7","recordVisit":"tally7","operateDay":"runShift7","hourOfDay":"hour7","totalVisits":"count7",
 "cents":"amount7","issued":"made7","fullName":"label7","visitCount":"visits7","firstBill":"bill8","total":"sum7"}, facts=[
 F("exit","exit",C,code=0,stdout=["VISITS 2","REVENUE 22500","ISSUED 2"]),
 F("world","validWorld",C), F("retained","retainedInPlace",C,"R8.1-8.4"),
 F("doctors","objects",C,className="clinic.Doctor",min=2,max=2), F("patients","objects",C,className="clinic.Patient",min=2,max=2),
 F("slots","objects",C,className="clinic.Slot",min=2,max=2), F("invoices","objects",C,className="clinic.Invoice",min=2,max=2),
 F("calls","invoked",C,methods=["clinic.Scheduler.bookVisit","clinic.Scheduler.reschedule","clinic.Scheduler.billFor","clinic.Doctor.visitFee"]),
 F("billCaller","caller",C,callee="clinic.Scheduler.billFor",caller="clinic.Clinic.operateDay"),
 F("rescheduled","field",C,className="clinic.Slot",field="hourOfDay",includes=[9,14]),
 F("visits","field",C,className="clinic.Patient",field="visitCount",includes=[1]),
 F("revenueLocal","local",C,method="clinic.Clinic.operateDay",name="total",value=22500),
 F("invoiceReturn","referenceReturn","target:P3","R5.3",method="clinic.Scheduler.billFor"),
 F("issuedStatic","statics","target:P3","R5.2",className="clinic.Invoice",fields=["issued"]),
 F("returnLands","returnDestination","target:P4","R6.4",min=1),
 F("argumentOrigins","parameterOrigin","target:P4","R6.5",min=5)])
P["acc02-shapes-plain"] = dict(id="ACC-2", title="Shape hierarchy: abstract class, overriding, super chains, enum, record", renames={
 "Shape":"Form7","Polygon":"Poly7","Rectangle":"Box7","Square":"Cube7","Dimensions":"Extent7","Unit":"Scale7","CENTIMETRE":"SMALL7","INCH":"LARGE7",
 "area":"size7","describe":"explain7","measure":"gauge7","factor":"ratio7","edge":"side7","extent":"span7","sideCount":"sides7","width":"w7","height":"h7",
 "describeCalls":"calls7","banner":"flag7","tile":"slab7"}, facts=[
 F("exit","exit",C,code=0,stdout=["AREAS 12 9","LABEL shape/polygon4/rectangle/square","FACTOR 3"]),
 F("world","validWorld",C), F("retained","retainedInPlace",C,"R8.1-8.4"),
 F("overrides","invoked",C,methods=["Square.area","Rectangle.area","Square.describe","Rectangle.describe","Polygon.describe","Shape.describe","Dimensions.width"]),
 F("superDescribe1","caller",C,callee="Rectangle.describe",caller="Square.describe"),
 F("superDescribe2","caller",C,callee="Polygon.describe",caller="Rectangle.describe"),
 F("superDescribe3","caller",C,callee="Shape.describe",caller="Polygon.describe"),
 F("concrete","objects",C,className="Square",min=1,max=1), F("records","objects",C,className="Dimensions",min=2,max=2),
 F("enumConstants","objects",C,className="Unit",min=2,max=2), F("recordComponent","field",C,className="Dimensions",field="width",includes=[6,3]),
 F("ctorNestPolygon","caller","target:P3","R5.5",callee="Polygon.<init>",caller="Rectangle.<init>",note="Today recorded as a sibling under Main.main (tests/characterization/constructorNesting)"),
 F("ctorNestShape","caller","target:P3","R5.5",callee="Shape.<init>",caller="Polygon.<init>"),
 F("enumStatics","statics","target:P3","R5.2",className="Unit",fields=["CENTIMETRE","INCH"]),
 F("dispatchFacts","eventCount","target:P4","R6.1-6.2",type="CALL",min=2)])
P["acc03-payments-gradle"] = dict(id="ACC-3", title="Payment gateway: interface with three implementations and a default method (Gradle)", renames={
 "Gateway":"Router7","PaymentMethod":"Tender7","CardPayment":"Plastic7","WalletPayment":"Purse7","BankTransfer":"Wire7","charge":"collect7",
 "surchargeCents":"fee7","choose":"pick7","settle":"clear7","routedCount":"routes7","balanceCents":"funds7","authorisations":"auths7","batchedTransfers":"wires7","settled":"paid7"}, facts=[
 F("exit","exit",C,code=0,stdout=["SETTLED 7477","ROUTES 5"]),
 F("world","validWorld",C), F("retained","retainedInPlace",C,"R8.1-8.4"),
 F("implementations","invoked",C,methods=["payments.CardPayment.charge","payments.WalletPayment.charge","payments.BankTransfer.charge","payments.PaymentMethod.surchargeCents"]),
 F("dispatchedFrom","caller",C,callee="payments.CardPayment.charge",caller="payments.Gateway.settle"),
 F("defaultMethod","caller",C,callee="payments.PaymentMethod.surchargeCents",caller="payments.CardPayment.charge"),
 F("card","objects",C,className="payments.CardPayment",min=1,max=1), F("wallet","objects",C,className="payments.WalletPayment",min=1,max=1),
 F("transfer","objects",C,className="payments.BankTransfer",min=1,max=1),
 F("walletBalance","field",C,className="payments.WalletPayment",field="balanceCents",includes=[1750]),
 F("cardAuths","field",C,className="payments.CardPayment",field="authorisations",includes=[2]),
 F("interfaceCallSites","eventCount","target:P4","R6.1-6.2",type="CALL",min=5),
 F("returnLands","returnDestination","target:P4","R6.4",min=5)])
P["acc04-seating-plain"] = dict(id="ACC-4", title="Seating chart: object, multidimensional and all-primitive arrays, exact longs", renames={
 "Seat":"Chair7","reserveFor":"hold7","priceSold":"paid7","occupant":"holder7","rowLetter":"letter7","columnNumber":"col7","guestNames":"names7",
 "tierPrices":"prices7","rowLabels":"labels7","ticketIds":"tickets7","reservedPerRow":"perRow7","largestTicket":"top7","grid":"map7","chosen":"pick7","revenue":"money7"}, facts=[
 F("exit","exit",C,code=0,stdout=["REVENUE 60.75","LARGEST 9007199254740993","ROWS 111"]),
 F("world","validWorld",C), F("seats","objects",C,className="Seat",min=12,max=12),
 F("occupants","field",C,className="Seat",field="occupant",includes=["Rin","Oto","Vale"]),
 F("intArray","array",C,className="int[]",elements=[1,1,1]),
 F("exactLong","local","target:P1","R5.4",method="Main.main",name="largestTicket",value="9007199254740993",note="Today unavailable: long beyond 2^53 rejected by rawScalar"),
 F("objectGrid","array","target:P3","R5.1",className="Seat[][]"), F("doubles","array","target:P3","R5.1",className="double[]",elements=[12.5,18.0,30.25]),
 F("chars","array","target:P3","R5.1",className="char[]"), F("longs","array","target:P3","R5.1",className="long[]"),
 F("mainArgs","array","target:P3","R5.1",className="String[]")])
P["acc05-playlist-plain"] = dict(id="ACC-5", title="Playlist manager: ArrayList, removeIf/sort lambdas, iteration", renames={
 "Playlist":"Mixtape7","Track":"Song7","enqueue":"push7","dropLongerThan":"trim7","orderByLength":"arrange7","playAll":"spin7","play":"hear7",
 "seconds":"secs7","playCount":"plays7","trackCount":"count7","queue":"list7","mix":"tape7"}, facts=[
 F("exit","exit",C,code=0,stdout=["TRACKS 3","LISTENED 559"]),
 F("world","validWorld",C), F("tracks","objects",C,className="Track",min=4,max=4),
 F("lambdaBodies","invoked",C,pattern=True,methods=["^Playlist\\.lambda\\$dropLongerThan\\$","^Playlist\\.lambda\\$orderByLength\\$"]),
 F("playedFromLoop","caller",C,callee="Track.play",caller="Playlist.playAll"),
 F("plays","field",C,className="Track",field="playCount",includes=[1,0]),
 F("listValue","libraryValue","target:P6","R7.3",className="java.util.ArrayList",size=3),
 F("libraryBoundaries","eventCount","target:P4","R7.1",type="CALL",min=4)])
P["acc06-wordindex-plain"] = dict(id="ACC-6", title="Word-frequency index: HashMap, TreeSet, HashSet, merge/getOrDefault", renames={
 "WordIndex":"Lexicon7","ingest":"absorb7","frequencyOf":"freq7","distinctWords":"unique7","lengthClasses":"lens7","firstAlphabetical":"lead7",
 "counts":"tally7","sortedWords":"ordered7","wordLengths":"sizes7","tokensSeen":"seen7"}, facts=[
 F("exit","exit",C,code=0,stdout=["THE 3","MISSING 0","DISTINCT 7","LENGTHS 3","FIRST and"]),
 F("world","validWorld",C), F("tokens","field",C,className="WordIndex",field="tokensSeen",includes=[10]),
 F("lookups","returns",C,method="WordIndex.frequencyOf",values=[3,0]),
 F("map","libraryValue","target:P6","R7.3",className="java.util.HashMap",size=7),
 F("sorted","libraryValue","target:P6","R7.3",className="java.util.TreeSet",size=7),
 F("lengths","libraryValue","target:P6","R7.3",className="java.util.HashSet",size=3),
 F("libraryBoundaries","eventCount","target:P4","R7.1",type="CALL",min=10)])
P["acc07-orders-maven"] = dict(id="ACC-7", title="Order pipeline: nested calls across six classes and six packages (Maven)", renames={
 "OrderController":"Front7","OrderService":"Desk7","PriceEngine":"Quoter7","Stock":"Shelf7","OrderRepository":"Vault7","AuditLog":"Ledger7",
 "assemble":"wire7","submit":"send7","place":"book7","quote":"price7","reserve":"hold7","save":"persist7","record":"note7","entryCount":"notes7",
 "auditedEntries":"audits7","unitsOnHand":"onHand7","storedRows":"rows7","entries":"lines7","placedOrders":"orders7"}, facts=[
 F("exit","exit",C,code=0,stdout=["TOTALS 5600 2800","AUDITED 2"]),
 F("world","validWorld",C), F("retained","retainedInPlace",C,"R8.1-8.4"), F("depth","maxDepth",C,min=6),
 F("c1","caller",C,callee="orders.service.OrderService.place",caller="orders.api.OrderController.submit"),
 F("c2","caller",C,callee="orders.pricing.PriceEngine.quote",caller="orders.service.OrderService.place"),
 F("c3","caller",C,callee="orders.inventory.Stock.reserve",caller="orders.pricing.PriceEngine.quote"),
 F("c4","caller",C,callee="orders.persistence.OrderRepository.save",caller="orders.inventory.Stock.reserve"),
 F("c5","caller",C,callee="orders.audit.AuditLog.record",caller="orders.persistence.OrderRepository.save"),
 F("packages","sourceFiles",C,min=7), F("stock","field",C,className="orders.inventory.Stock",field="unitsOnHand",includes=[2]),
 F("returnLands","returnDestination","target:P4","R6.4",min=4), F("argumentOrigins","parameterOrigin","target:P4","R6.5",min=6),
 F("callSites","eventCount","target:P4","R6.1",type="CALL",min=10)])
P["acc08-maze-plain"] = dict(id="ACC-8", title="Maze solver: branching backtracking recursion on char[][] (not factorial)", renames={
 "MazeSolver":"Walker7","explore":"probe7","deepest":"maxd7","backtracks":"undo7","cells":"tiles7","solver":"walker8","here":"spot7"}, facts=[
 F("exit","exit",C,code=0,stdout=["SOLVED true","DEEPEST 41","BACKTRACKS 16"]),
 F("world","validWorld",C), F("retained","retainedInPlace",C,"R8.1-8.4"),
 F("deep","maxDepth",C,min=40), F("calls","invocations",C,min=100), F("backtrackCount","field",C,className="MazeSolver",field="backtracks",includes=[16]),
 F("grid","array","target:P3","R5.1",className="char[][]")])
P["acc09-config-plain"] = dict(id="ACC-9", title="Config loader: custom checked exception caught several frames up, finally, retry", renames={
 "ConfigLoader":"Reader7","Parser":"Splitter7","Validator":"Checker7","Rule":"Guard7","ConfigException":"BadInput7","loadLenient":"soft7",
 "check":"verify7","apply":"enforce7","evaluations":"evals7","validator":"checker8","parser":"splitter8","loader":"reader8"}, facts=[
 F("exit","exit",C,code=0,stdout=["RECOVERED non-positive timeout","RETRY 2","CLOSED true"]),
 F("world","validWorld",C), F("retained","retainedInPlace",C,"R8.1-8.4"),
 F("caughtUp","exception",C,className="ConfigException",caughtIn="Main.main",unwound=4,unwoundMethods=["Rule.apply","Validator.check","Parser.parse","ConfigLoader.load"]),
 F("oneCatch","eventCount",C,type="CATCH_EXCEPTION",min=1,max=1), F("exceptionObject","objects",C,className="ConfigException",min=1,max=1),
 F("evaluations","field",C,className="Rule",field="evaluations",includes=[5])])
P["acc10-converter-plain"] = dict(id="ACC-10", title="Unit converter REPL: Scanner stdin, stdout, stderr", stdin="km 10\nmi 3\nlb 4\nkg 2\nquit\n", renames={
 "Converter":"Translator7","convert":"apply7","factorFor":"rate7","conversions":"done7","converter":"translator8"}, facts=[
 F("exit","exit",C,code=0,stdout=["RESULT 6.21","RESULT 4.827","RESULT 4.41","CONVERSIONS 3"],stderr=["UNKNOWN lb"]),
 F("world","validWorld",C), F("input","eventCount",C,type="CONSOLE_INPUT",min=1), F("output","eventCount",C,type="CONSOLE_WRITE",min=5),
 F("conversions","field",C,className="Converter",field="conversions",includes=[3]),
 F("inputLands","inputDestination","target:P4","R6.3/R7.1/R14.2",min=3,note="stdin -> Scanner.nextDouble -> local amount"),
 F("idleNotKilled","exit",C,"R1.4",code=0,stdout=["CONVERSIONS"],note="Idle >= 60 s at the prompt; characterized in tests/characterization/sessionBudgets (X4). Run with stdinDelayMs=60000.",stdinDelayMs=60000)])
P["acc11-csv-maven"] = dict(id="ACC-11", title="CSV report with a Maven dependency (commons-csv)", renames={
 "RegionTotals":"Ledger7","Bucket":"Bin7","accumulate":"add7","bucketFor":"binFor7","addAmount":"put7","rowsSeen":"rows7","entries":"items7","totals":"ledger8"}, facts=[
 F("exit","exit",C,code=0,stdout=["NORTH 150","SOUTH 100","OTHER 55","ROWS 5"]),
 F("world","validWorld",C), F("dependency","dependency",C,name="commons-csv"),
 F("buckets","field",C,className="report.Bucket",field="amount",includes=[150,100,55]),
 F("projectOnly","invoked",C,methods=["report.RegionTotals.accumulate","report.Bucket.addAmount"]),
 F("libraryBoundaries","eventCount","target:P4","R7.1-7.2",type="CALL",min=10)])
P["acc12-catalogue-gradle"] = dict(id="ACC-12", title="Library catalogue: four packages, static singleton, linked objects (Gradle)", renames={
 "Catalogue":"Archive7","ShelfRepository":"Rack7","Author":"Penman7","Book":"Tome7","TitleSearch":"Finder7","register":"enrol7","store":"keep7",
 "head":"top7","storedCount":"kept7","firstContaining":"locate7","titlesWritten":"works7","publishedYear":"year7","nextOnShelf":"next7","heading":"caption7",
 "registrations":"enrols7","INSTANCE":"SOLE7","repository":"rack8","displayName":"penName7","writer":"author8"}, facts=[
 F("exit","exit",C,code=0,stdout=["FOUND 2004","COUNT 3","REGISTRATIONS 3"]),
 F("world","validWorld",C), F("books","objects",C,className="catalogue.model.Book",min=3,max=3),
 F("authors","objects",C,className="catalogue.model.Author",min=2,max=2),
 F("written","field",C,className="catalogue.model.Author",field="titlesWritten",includes=[2,1]),
 F("staticInit","caller",C,callee="catalogue.app.Catalogue.<init>",caller="catalogue.app.Catalogue.<clinit>"),
 F("packages","sourceFiles",C,min=6),
 F("singleton","statics","target:P3","R5.2",className="catalogue.app.Catalogue",fields=["INSTANCE","registrations"]),
 F("foundBook","referenceReturn","target:P3","R5.3",method="catalogue.search.TitleSearch.firstContaining")])
P["acc13-socialgraph-plain"] = dict(id="ACC-13", title="Social graph: 3,000 members, 12,000 follow references, BFS", renames={
 "Member":"Peer7","Follow":"Link7","Network":"Mesh7","generate":"build7","follow":"attach7","degreesFrom":"bfs7","memberNumber":"num7",
 "firstFollow":"head7","nextFollow":"after7","memberCount":"pop7","followCount":"links7","byNumber":"table7"}, facts=[
 F("partialRecording","recording",C,"R1.1-1.2",state="STOPPED_LIMIT",budget="objects",note="P0 exit86 evidence retained in checkpoint; P1 preserves actual completion and a bounded prefix."),
 F("observedPrefix","eventCount",C,type="CAPTURE_STOP",min=1,max=1), F("prefixObjects","objects",C,className="Member",min=200,max=256),
 F("completes","exit",C,"R1.1-1.2",code=0,stdout=["MEMBERS 3000","FOLLOWS 12000","REACHABLE 2929","FARTHEST 10"]),
 F("allMembers","objects","target:P5","R1/R12",className="Member",min=3000),
 F("allFollows","objects","target:P5","R1/R12",className="Follow",min=12000)])
P["acc14-simulator-plain"] = dict(id="ACC-14", title="Discrete-event simulator: hundreds of thousands of events, thousands of invocations", renames={
 "Simulation":"World7","EventHeap":"Agenda7","Counter":"Desk7","seedArrivals":"seed7","runUntilIdle":"drain7","handle":"process7","serve":"work7",
 "push":"add7","pop":"take7","peekTime":"t7","peekCustomer":"c7","peekStage":"s7","earlier":"before7","exchange":"trade7","nextRandom":"rnd7",
 "counters":"desks7","maxQueueDepth":"peak7","busyTime":"busy7","served":"done7","randomState":"seed8"}, facts=[
 F("partialRecording","recording",C,"R1.1-1.2",state="STOPPED_LIMIT",budget="events",note="P0 exit86 evidence retained in checkpoint; P1 preserves actual completion and a bounded prefix."),
 F("observedPrefix","eventCount",C,type="CAPTURE_STOP",min=1,max=1), F("prefixSize","eventCount",C,type="*",min=20000),
 F("completes","exit",C,"R1.1-1.2",code=0,stdout=["PROCESSED 2400","MAX_QUEUE 400","CLOCK 5163"]),
 F("largeHistory","eventCount","target:P2","R12/R20",type="*",min=200000), F("manyInvocations","invocations","target:P2","R12/R20",min=5000)])
for name, spec in P.items():
    doc = {"id": spec["id"], "title": spec["title"], "question": Q, "fresh": True,
           "freshness": "Written for acceptance-v12; shares no names, structure or source with Person/factorial/bubble-sort/control demos or v11.5 audit fixtures.",
           **({"stdin": spec["stdin"]} if "stdin" in spec else {}), "renames": spec["renames"], "facts": spec["facts"]}
    with open(f"fixtures/acceptance-v12/{name}/expected.facts.json", "w") as fh: json.dump(doc, fh, indent=1); fh.write("\n")
# Task 0.6: real-JVM regression runs of the curated demos' Main.java through the generic path.
curated = {
 "person": [F("exit","exit",C,code=0), F("world","validWorld",C), F("object","objects",C,className="Person",min=1,max=1),
   F("mutation","field",C,className="Person",field="age",includes=[18]), F("setter","caller",C,callee="Person.setAge",caller="Main.main")],
 "recursion": [F("exit","exit",C,code=0,stdout=["120"]), F("world","validWorld",C), F("depth","maxDepth",C,min=5),
   F("returns","returns",C,method="Main.factorial",values=[1,2,6,24,120]), F("returnLands","returnDestination","target:P4","R6.4",min=5)],
 "arrays": [F("exit","exit",C,code=0), F("world","validWorld",C), F("sorted","array",C,className="int[]",elements=[1,3,5,6,8]),
   F("writes","eventCount",C,type="ARRAY_WRITE",min=1), F("noCuratedEvents","noEvent",C,types=["ARRAY_COMPARE","LOOP_ITERATION","ENTER_SCOPE"])],
 "control": [F("exit","exit",C,code=0,stdout=["0","42","100","142"]), F("world","validWorld",C), F("clamped","returns",C,method="Main.clamp",values=[0,42,100]),
   F("noCuratedEvents","noEvent",C,types=["INPUT_READ","OUTPUT_WRITE","ENTER_SCOPE","EVALUATE_CONDITION","LOOP_ITERATION"]),
   F("inputLands","inputDestination","target:P4","R6.3/R14.2",min=3)],
}
stdin = {"control": "-7\n42\n130\n"}
with open("tests/acceptance/curated.facts.json", "w") as fh:
    json.dump({name: {"dir": f"src/examples/demos/{name}", **({"stdin": stdin[name]} if name in stdin else {}), "facts": facts} for name, facts in curated.items()}, fh, indent=1); fh.write("\n")
print("ok", len(P), "projects")
