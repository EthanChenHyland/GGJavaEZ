# Third-party notices

These notices apply to the named third-party components, not GGJavaEZ's original source. No first-party software license has been selected.

| Component | Checked-in use | License / source |
| --- | --- | --- |
| OW2 ASM 9.10.1: asm, asm-tree, asm-analysis, asm-util | Four pinned jars in `instrumentation/lib`; provider verifies their SHA-256 before use | BSD-3-Clause. [Bundled notice](instrumentation/lib/LICENSE-BSD-3-Clause.txt), [upstream license](https://asm.ow2.io/license.html), [published artifact metadata](https://repo.maven.apache.org/maven2/org/ow2/asm/asm/9.10.1/asm-9.10.1.pom). The old Apache attribution was incorrect and has been corrected without changing jars. |
| Inter 4.001 | `public/fonts/Inter.ttf`, embedded copyright: 2016 The Inter Project Authors | SIL Open Font License 1.1. [Bundled notice](public/fonts/OFL.txt), [upstream](https://github.com/rsms/inter/blob/master/LICENSE.txt). |
| Gradle wrapper | Regression fixture `fixtures/projects-m9/people-gradle/gradle/wrapper/gradle-wrapper.jar` | Apache-2.0; [existing fixture license](fixtures/projects-m9/people-gradle/gradle/wrapper/LICENSE). Wrapper properties pin the distribution URL and SHA-256. |

npm dependencies are obtained through `package-lock.json`; their installed packages supply their own licenses/notices. Direct runtime dependencies declare MIT, except Lucide's ISC license. Transitive dependencies additionally include Apache, BSD, ISC, MPL and other declared licenses. This is a sanity inventory, not an exhaustive legal review or a license grant for GGJavaEZ.

Eclipse JDT LS is **not checked in**. The optional setup script obtains a pinned, checksum-verified distribution into ignored local tool storage; retain the distribution's upstream notices. Maven and Gradle distributions and dependency caches also remain machine-local rather than bundled repository content.

The original runtime-design references and intentionally reviewed QA images are kept as product documentation. Future bulk generated checkpoint media are ignored by default; repository maintainers should explicitly review any additional binary evidence before tracking it.
