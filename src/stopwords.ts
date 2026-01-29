/**
 * Icelandic stopwords for search indexing.
 *
 * Source: https://github.com/atlijas/icelandic-stop-words
 * Data from DIM (Database of Icelandic Morphology) by Árni Magnússon Institute.
 *
 * Includes all inflected forms of pronouns, prepositions, conjunctions, etc.
 */

// prettier-ignore
export const STOPWORDS_IS = new Set([
  "á","að","aðra","aðrar","aðrir","af","alla","allan","allar","allir",
  "allnokkra","allnokkrar","allnokkrir","allnokkru","allnokkrum","allnokkuð",
  "allnokkur","allnokkurn","allnokkurra","allnokkurrar","allnokkurri","allnokkurs",
  "allnokkurt","allra","allrar","allri","alls","allt","alltað","allur","án",
  "andspænis","annað","annaðhvort","annan","annar","annarra","annarrar","annarri",
  "annars","árla","ásamt","auk","austan","austanundir","austur","báða","báðar",
  "báðir","báðum","bæði","bak","beggja","eða","eður","ef","eftir","ég","ein",
  "eina","einar","einhver","einhverja","einhverjar","einhverjir","einhverju",
  "einhverjum","einhvern","einhverra","einhverrar","einhverri","einhvers","einir",
  "einn","einna","einnar","einni","eins","einskis","einu","einum","eitt","eitthvað",
  "eitthvert","ekkert","ella","ellegar","en","enda","enga","engan","engar","engin",
  "enginn","engir","engra","engrar","engri","engu","engum","er","fáein","fáeina",
  "fáeinar","fáeinir","fáeinna","fáeinum","fjær","fjarri","flestalla","flestallan",
  "flestallar","flestallir","flestallra","flestallrar","flestallri","flestalls",
  "flestallt","flestallur","flestöll","flestöllu","flestöllum","frá","fram","fyrir",
  "fyrst","gagnstætt","gagnvart","gegn","gegnt","gegnum","hana","handa","handan",
  "hann","hans","heldur","hennar","henni","hið","hin","hina","hinar","hinir","hinn",
  "hinna","hinnar","hinni","hins","hinu","hinum","hitt","hjá","honum","hún","hvað",
  "hvaða","hvenær","hver","hverja","hverjar","hverjir","hverju","hverjum","hvern",
  "hverra","hverrar","hverri","hvers","hvert","hvílík","hvílíka","hvílíkan",
  "hvílíkar","hvílíkir","hvílíkra","hvílíkrar","hvílíkri","hvílíks","hvílíkt",
  "hvílíku","hvílíkum","hvílíkur","hvor","hvora","hvorar","hvorir","hvorki","hvorn",
  "hvorra","hvorrar","hvorri","hvors","hvort","hvoru","hvorug","hvoruga","hvorugan",
  "hvorugar","hvorugir","hvorugra","hvorugrar","hvorugri","hvorugs","hvorugt",
  "hvorugu","hvorugum","hvorugur","hvorum","í","inn","innan","innanundir","jafnframt",
  "jafnhliða","kring","kringum","með","meðal","meðan","meður","mér","mestalla",
  "mestallan","mestallar","mestallir","mestallra","mestallrar","mestallri","mestalls",
  "mestallt","mestallur","mestöll","mestöllu","mestöllum","miðli","mig","milli",
  "millum","mín","mína","mínar","mínir","minn","minna","minnar","minni","míns",
  "mínu","mínum","mitt","mót","móti","nær","nærri","næst","næstum","nálægt","né",
  "neðan","nein","neina","neinar","neinir","neinn","neinna","neinnar","neinni",
  "neins","neinu","neinum","neitt","nema","niður","nokkra","nokkrar","nokkrir",
  "nokkru","nokkrum","nokkuð","nokkur","nokkurn","nokkurra","nokkurrar","nokkurri",
  "nokkurs","nokkurt","norðan","nú","öðru","öðrum","of","ofan","ofar","og","óháð",
  "okkar","okkur","öll","öllu","öllum","önnur","órafjarri","oss","sá","sakir",
  "sama","saman","samar","samfara","samhliða","sami","samir","samkvæmt","samra",
  "samrar","samri","sams","samskipa","samt","samtímis","samur","sem","sér","sérhvað",
  "sérhver","sérhverja","sérhverjar","sérhverjir","sérhverju","sérhverjum","sérhvern",
  "sérhverra","sérhverrar","sérhverri","sérhvers","sérhvert","síðan","síðla","sig",
  "sín","sína","sínar","sínhver","sínhverja","sínhverjar","sínhverjir","sínhverju",
  "sínhverjum","sínhvern","sínhverra","sínhverrar","sínhverri","sínhvers","sínhvert",
  "sínhvor","sínhvora","sínhvorar","sínhvorir","sínhvorn","sínhvorra","sínhvorrar",
  "sínhvorri","sínhvors","sínhvort","sínhvoru","sínhvorum","sínir","sinn","sinna",
  "sinnar","sinnhver","sinnhverja","sinnhverjar","sinnhverjir","sinnhverju",
  "sinnhverjum","sinnhvern","sinnhverra","sinnhverrar","sinnhverri","sinnhvers",
  "sinnhvert","sinnhvor","sinnhvora","sinnhvorar","sinnhvorir","sinnhvorn",
  "sinnhvorra","sinnhvorrar","sinnhvorri","sinnhvors","sinnhvort","sinnhvoru",
  "sinnhvorum","sinni","síns","sínu","sínum","sitt","sitthvað","sitthver",
  "sitthverja","sitthverjar","sitthverjir","sitthverju","sitthverjum","sitthvern",
  "sitthverra","sitthverrar","sitthverri","sitthvers","sitthvert","sitthvor",
  "sitthvora","sitthvorar","sitthvorir","sitthvorn","sitthvorra","sitthvorrar",
  "sitthvorri","sitthvors","sitthvort","sitthvoru","sitthvorum","sjálf","sjálfa",
  "sjálfan","sjálfar","sjálfir","sjálfra","sjálfrar","sjálfri","sjálfs","sjálft",
  "sjálfu","sjálfum","sjálfur","slík","slíka","slíkan","slíkar","slíkir","slíkra",
  "slíkrar","slíkri","slíks","slíkt","slíku","slíkum","slíkur","snemma","sökum",
  "söm","sömu","sömum","sú","sum","suma","suman","sumar","sumir","sumra","sumrar",
  "sumri","sums","sumt","sumu","sumum","sumur","sunnan","svo","til","tráss","um",
  "umfram","umhverfis","undan","undir","uns","upp","úr","út","utan","útundan",
  "vegna","vér","vestan","vestur","vettugi","við","viður","vor","vora","vorar",
  "vorir","vorn","vorra","vorrar","vorri","vors","vort","voru","vorum","yðar",
  "yður","yfir","ykkar","ykkur","ýmis","ýmiss","ýmissa","ýmissar","ýmissi","ýmist",
  "ýmsa","ýmsan","ýmsar","ýmsir","ýmsu","ýmsum","þá","það","þær","þann","þar",
  "þau","þegar","þeim","þeir","þeirra","þeirrar","þeirri","þennan","þér","þess",
  "þessa","þessar","þessara","þessarar","þessari","þessi","þessir","þessu",
  "þessum","þetta","þið","þig","þín","þína","þínar","þínir","þinn","þinna",
  "þinnar","þinni","þíns","þínu","þínum","þitt","þó","þónokkra","þónokkrar",
  "þónokkrir","þónokkru","þónokkrum","þónokkuð","þónokkur","þónokkurn","þónokkurra",
  "þónokkurrar","þónokkurri","þónokkurs","þónokkurt","þótt","þú","því","þvílík",
  "þvílíka","þvílíkan","þvílíkar","þvílíkir","þvílíkra","þvílíkrar","þvílíkri",
  "þvílíks","þvílíkt","þvílíku","þvílíkum","þvílíkur",
]);

/**
 * Check if a word is a stopword.
 */
export function isStopword(word: string): boolean {
  return STOPWORDS_IS.has(word.toLowerCase());
}

/**
 * Filter stopwords from an array of words/lemmas.
 */
export function removeStopwords<T extends string>(words: T[]): T[] {
  return words.filter((w) => !isStopword(w));
}
