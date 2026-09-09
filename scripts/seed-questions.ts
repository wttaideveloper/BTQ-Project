import "dotenv/config";
import { v4 as uuidv4 } from "uuid";
import { database } from "../server/database";
import { QuestionValidationService } from "../server/question-validation";
import type { Answer, Question } from "@shared/schema";

type SeedQuestion = {
  text: string;
  context: string;
  correct: string;
  wrong: [string, string, string];
};

type SeedGroup = {
  category: string;
  difficulty: string;
  questions: SeedQuestion[];
};

const SEED_GROUPS: SeedGroup[] = [
  {
    category: "Old Testament",
    difficulty: "Beginner",
    questions: [
      {
        text: "Who was the first man created by God?",
        context: "Genesis 2:7 tells how God formed him from the dust of the ground",
        correct: "Adam",
        wrong: ["Eve", "Noah", "Abraham"],
      },
      {
        text: "On which day did God rest after creating the world?",
        context: "Genesis 2:2 to Genesis 2:3",
        correct: "The seventh day",
        wrong: ["The third day", "The fifth day", "The first day"],
      },
      {
        text: "Who built the ark before the great flood?",
        context: "Genesis 6:14, God gave him the exact measurements for the ark",
        correct: "Noah",
        wrong: ["Moses", "Jacob", "Enoch"],
      },
      {
        text: "What sign did God put in the sky as a promise to Noah?",
        context: "Genesis 9:13, a sign that the earth would never be flooded again",
        correct: "A rainbow",
        wrong: ["A bright star", "A pillar of cloud", "Lightning"],
      },
    ],
  },
  {
    category: "Old Testament",
    difficulty: "Intermediate",
    questions: [
      {
        text: "How many plagues did God send upon Egypt?",
        context: "Exodus 7 to Exodus 12, from blood in the Nile to the death of the firstborn",
        correct: "Ten",
        wrong: ["Seven", "Twelve", "Three"],
      },
      {
        text: "What did Moses receive from God on Mount Sinai?",
        context: "Exodus 31:18, written by the finger of God on stone tablets",
        correct: "The Ten Commandments",
        wrong: ["The Lord's Prayer", "A golden calf", "The blueprint of the temple"],
      },
      {
        text: "Who led the Israelites into the promised land after Moses died?",
        context: "Joshua 1:1 to Joshua 1:2, Moses saw the land but did not enter it",
        correct: "Joshua",
        wrong: ["Aaron", "Caleb", "Gideon"],
      },
      {
        text: "Which young shepherd defeated the giant Goliath?",
        context: "1 Samuel 17, he refused the king's armor and used a sling",
        correct: "David",
        wrong: ["Saul", "Samson", "Jonathan"],
      },
    ],
  },
  {
    category: "Old Testament",
    difficulty: "Advanced",
    questions: [
      {
        text: "Who was the oldest man recorded in the Bible?",
        context: "Genesis 5:27, he lived 969 years",
        correct: "Methuselah",
        wrong: ["Adam", "Noah", "Enoch"],
      },
      {
        text: "Which prophet was taken up to heaven in a whirlwind?",
        context: "2 Kings 2:11, he never died but was carried away by chariots of fire",
        correct: "Elijah",
        wrong: ["Elisha", "Ezekiel", "Isaiah"],
      },
      {
        text: "From which Philistine city did the giant Goliath come?",
        context: "1 Samuel 17:4 names his hometown",
        correct: "Gath",
        wrong: ["Ashdod", "Gaza", "Ekron"],
      },
      {
        text: "How many books are in the Old Testament?",
        context: "The Protestant canon from Genesis to Malachi",
        correct: "39",
        wrong: ["27", "66", "46"],
      },
    ],
  },
  {
    category: "New Testament",
    difficulty: "Beginner",
    questions: [
      {
        text: "In which town was Jesus born?",
        context: "Luke 2:4 to Luke 2:7, the town of David",
        correct: "Bethlehem",
        wrong: ["Nazareth", "Jerusalem", "Capernaum"],
      },
      {
        text: "Who baptized Jesus in the Jordan River?",
        context: "Matthew 3:13 to Matthew 3:17",
        correct: "John the Baptist",
        wrong: ["Peter", "Andrew", "Philip"],
      },
      {
        text: "How many apostles did Jesus choose?",
        context: "Luke 6:13, he called them by name",
        correct: "Twelve",
        wrong: ["Seven", "Ten", "Three"],
      },
      {
        text: "What was the first miracle of Jesus?",
        context: "John 2:11, at a wedding in Cana",
        correct: "Turning water into wine",
        wrong: ["Healing a leper", "Walking on water", "Feeding five thousand"],
      },
    ],
  },
  {
    category: "New Testament",
    difficulty: "Intermediate",
    questions: [
      {
        text: "Which disciple denied Jesus three times before the rooster crowed?",
        context: "Luke 22:61, Jesus turned and looked at him",
        correct: "Peter",
        wrong: ["Thomas", "Judas", "Philip"],
      },
      {
        text: "Who betrayed Jesus for thirty pieces of silver?",
        context: "Matthew 26:14 to Matthew 26:16",
        correct: "Judas Iscariot",
        wrong: ["Barabbas", "Nicodemus", "Joseph of Arimathea"],
      },
      {
        text: "On the road to which city was Saul struck blind?",
        context: "Acts 9:3 to Acts 9:8",
        correct: "Damascus",
        wrong: ["Antioch", "Rome", "Joppa"],
      },
      {
        text: "Which sea did Jesus calm during a storm?",
        context: "Mark 4:39, he rebuked the wind and said Peace, be still",
        correct: "The Sea of Galilee",
        wrong: ["The Red Sea", "The Dead Sea", "The Mediterranean Sea"],
      },
    ],
  },
  {
    category: "New Testament",
    difficulty: "Advanced",
    questions: [
      {
        text: "On which island was John when he received the Revelation?",
        context: "Revelation 1:9, he was in the Spirit on the Lord's day",
        correct: "Patmos",
        wrong: ["Crete", "Cyprus", "Malta"],
      },
      {
        text: "Which couple died after lying about the price of their land?",
        context: "Acts 5:1 to Acts 5:10",
        correct: "Ananias and Sapphira",
        wrong: ["Aquila and Priscilla", "Zechariah and Elizabeth", "Felix and Drusilla"],
      },
      {
        text: "How many churches received letters in the book of Revelation?",
        context: "Revelation 2 and Revelation 3",
        correct: "Seven",
        wrong: ["Three", "Twelve", "Five"],
      },
      {
        text: "Which Pharisee came to question Jesus secretly at night?",
        context: "John 3:1 to John 3:21",
        correct: "Nicodemus",
        wrong: ["Gamaliel", "Caiaphas", "Joseph of Arimathea"],
      },
    ],
  },
  {
    category: "Bible Stories",
    difficulty: "Beginner",
    questions: [
      {
        text: "What swallowed Jonah for three days and three nights?",
        context: "Jonah 1:17, prepared by the Lord",
        correct: "A great fish",
        wrong: ["A giant squid", "A sea serpent", "A crocodile"],
      },
      {
        text: "Who was thrown into the lions' den and survived?",
        context: "Daniel 6:22, God sent his angel to shut the lions' mouths",
        correct: "Daniel",
        wrong: ["Shadrach", "Ezekiel", "Mordecai"],
      },
      {
        text: "Who interpreted Pharaoh's dreams and became a ruler in Egypt?",
        context: "Genesis 41:41, Pharaoh put his signet ring on his hand",
        correct: "Joseph",
        wrong: ["Daniel", "Moses", "Benjamin"],
      },
      {
        text: "What happened to Lot's wife when she looked back at Sodom?",
        context: "Genesis 19:26",
        correct: "She became a pillar of salt",
        wrong: ["She turned to stone", "She was struck blind", "She was carried away by angels"],
      },
    ],
  },
  {
    category: "Bible Stories",
    difficulty: "Intermediate",
    questions: [
      {
        text: "How many people were saved inside Noah's ark?",
        context: "1 Peter 3:20 mentions the number of souls saved through water",
        correct: "Eight",
        wrong: ["Four", "Twelve", "Forty"],
      },
      {
        text: "Which three men were thrown into the fiery furnace?",
        context: "Daniel 3:23, a fourth figure appeared in the fire with them",
        correct: "Shadrach, Meshach and Abednego",
        wrong: ["Daniel, Hananiah and Azariah", "Daniel, Shadrach and Meshach", "Elijah, Elisha and Ezekiel"],
      },
      {
        text: "Which queen traveled far to test Solomon's wisdom?",
        context: "1 Kings 10:1 to 1 Kings 10:3, she came with hard questions",
        correct: "The Queen of Sheba",
        wrong: ["Queen Esther", "Queen Vashti", "Queen Jezebel"],
      },
      {
        text: "Who was sold into slavery by his own brothers?",
        context: "Genesis 37:28, sold for twenty pieces of silver",
        correct: "Joseph",
        wrong: ["Levi", "Reuben", "Benjamin"],
      },
    ],
  },
  {
    category: "Bible Stories",
    difficulty: "Advanced",
    questions: [
      {
        text: "Whose servant lied to receive gifts from Naaman and was struck with leprosy?",
        context: "2 Kings 5:20 to 2 Kings 5:27",
        correct: "Gehazi",
        wrong: ["Elisha", "Obadiah", "Micaiah"],
      },
      {
        text: "What did the spies bring back from the land of Canaan?",
        context: "Numbers 13:23, carried on a pole between two men",
        correct: "A cluster of grapes",
        wrong: ["Golden apples", "Fig leaves", "Barley loaves"],
      },
      {
        text: "In Ezekiel's vision, what did the valley of dry bones represent?",
        context: "Ezekiel 37:11, God explains the meaning to the prophet",
        correct: "The whole house of Israel",
        wrong: ["The city of Babylon", "The fallen angels", "The armies of Ammon"],
      },
      {
        text: "How many prophets of Baal faced Elijah on Mount Carmel?",
        context: "1 Kings 18:19, four hundred and fifty of them",
        correct: "450",
        wrong: ["400", "70", "850"],
      },
    ],
  },
  {
    category: "Famous People",
    difficulty: "Beginner",
    questions: [
      {
        text: "Who is called the father of many nations?",
        context: "Genesis 17:5, God changed his name as part of the covenant",
        correct: "Abraham",
        wrong: ["Isaac", "Jacob", "Moses"],
      },
      {
        text: "Who was the mother of Jesus?",
        context: "Luke 1:31, the angel Gabriel announced his birth to her",
        correct: "Mary",
        wrong: ["Martha", "Elizabeth", "Anna"],
      },
      {
        text: "Which brother killed Abel?",
        context: "Genesis 4:8, the first murder in the Bible",
        correct: "Cain",
        wrong: ["Seth", "Lamech", "Esau"],
      },
      {
        text: "Which disciple walked on water toward Jesus before beginning to sink?",
        context: "Matthew 14:29 to Matthew 14:31, Jesus caught him saying you of little faith",
        correct: "Peter",
        wrong: ["John", "James", "Andrew"],
      },
    ],
  },
  {
    category: "Famous People",
    difficulty: "Intermediate",
    questions: [
      {
        text: "Who was Moses' brother and the first high priest of Israel?",
        context: "Exodus 28:1, his sons also served as priests",
        correct: "Aaron",
        wrong: ["Hur", "Caleb", "Eleazar"],
      },
      {
        text: "Which queen risked her life to save her people from destruction?",
        context: "Esther 4:11, entering the king's court uninvited could mean death",
        correct: "Esther",
        wrong: ["Ruth", "Deborah", "Vashti"],
      },
      {
        text: "Which prophet anointed both Saul and David as kings?",
        context: "1 Samuel 10:1 and 1 Samuel 16:13",
        correct: "Samuel",
        wrong: ["Nathan", "Elijah", "Gad"],
      },
      {
        text: "Who was the mother of John the Baptist?",
        context: "Luke 1:57 to Luke 1:60, the neighbors wanted to name him after his father",
        correct: "Elizabeth",
        wrong: ["Mary", "Anna", "Joanna"],
      },
    ],
  },
  {
    category: "Famous People",
    difficulty: "Advanced",
    questions: [
      {
        text: "Which judge made a rash vow concerning his daughter?",
        context: "Judges 11:30 to Judges 11:39",
        correct: "Jephthah",
        wrong: ["Gideon", "Samson", "Barak"],
      },
      {
        text: "Who was the mother of Samuel?",
        context: "1 Samuel 1:20, she named him saying I have asked him of the Lord",
        correct: "Hannah",
        wrong: ["Peninnah", "Sarah", "Rachel"],
      },
      {
        text: "Which queen was deposed for refusing to display her beauty to the guests?",
        context: "Esther 1:12, her refusal set the stage for Esther's rise",
        correct: "Vashti",
        wrong: ["Esther", "Sheba", "Jezebel"],
      },
      {
        text: "Which writer of the New Testament was a physician?",
        context: "Colossians 4:14 names his profession",
        correct: "Luke",
        wrong: ["Mark", "Silas", "Barnabas"],
      },
    ],
  },
  {
    category: "Theme-Based",
    difficulty: "Beginner",
    questions: [
      {
        text: "What is the first book of the Bible?",
        context: "It opens with the words In the beginning",
        correct: "Genesis",
        wrong: ["Exodus", "Psalms", "Job"],
      },
      {
        text: "What is the last book of the Bible?",
        context: "It closes with the promise that Jesus is coming quickly",
        correct: "Revelation",
        wrong: ["Malachi", "Acts", "Jude"],
      },
      {
        text: "Which prayer did Jesus teach his disciples?",
        context: "Luke 11:1 to Luke 11:4, taught when a disciple asked Lord teach us to pray",
        correct: "The Lord's Prayer",
        wrong: ["The Shema", "The Serenity Prayer", "The priestly blessing"],
      },
      {
        text: "How many commandments were written on the stone tablets?",
        context: "Exodus 34:28",
        correct: "Ten",
        wrong: ["Five", "Seven", "Two"],
      },
    ],
  },
  {
    category: "Theme-Based",
    difficulty: "Intermediate",
    questions: [
      {
        text: "What food did Jesus use to feed the five thousand?",
        context: "Matthew 14:17 to Matthew 14:21, a boy offered his lunch",
        correct: "Five loaves and two fish",
        wrong: ["Two loaves and five fish", "Seven loaves of bread", "Ten loaves and one fish"],
      },
      {
        text: "In the Sermon on the Mount, who will inherit the earth?",
        context: "Matthew 5:5, one of the Beatitudes",
        correct: "The meek",
        wrong: ["The strong", "The wise", "The proud"],
      },
      {
        text: "Which fruit of the Spirit is listed first?",
        context: "Galatians 5:22 to Galatians 5:23",
        correct: "Love",
        wrong: ["Joy", "Peace", "Patience"],
      },
      {
        text: "In the parable, which man stopped to help the wounded traveler?",
        context: "Luke 10:33, two religious men had passed by on the other side",
        correct: "A Samaritan",
        wrong: ["A Levite", "A priest", "A Roman soldier"],
      },
    ],
  },
  {
    category: "Theme-Based",
    difficulty: "Advanced",
    questions: [
      {
        text: "In the armor of God, what does the shield represent?",
        context: "Ephesians 6:16, able to quench the fiery darts of the wicked",
        correct: "Faith",
        wrong: ["Truth", "Righteousness", "Salvation"],
      },
      {
        text: "Which prophet foretold that a virgin would conceive and bear a son?",
        context: "Isaiah 7:14, quoted in Matthew 1:23",
        correct: "Isaiah",
        wrong: ["Jeremiah", "Micah", "Hosea"],
      },
      {
        text: "Which two gospels record the genealogy of Jesus?",
        context: "Matthew 1:1 and Luke 3:23",
        correct: "Matthew and Luke",
        wrong: ["Mark and John", "Matthew and Mark", "Luke and John"],
      },
      {
        text: "Whose names are written on the twelve foundations of the New Jerusalem?",
        context: "Revelation 21:14",
        correct: "The twelve apostles",
        wrong: ["The twelve tribes of Israel", "The twelve judges", "The twelve minor prophets"],
      },
    ],
  },
];

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildQuestion(group: SeedGroup, seed: SeedQuestion): Question {
  const answerTexts = shuffle([seed.correct, ...seed.wrong]);
  const answers: Answer[] = answerTexts.map((text) => ({
    id: uuidv4(),
    text,
    isCorrect: text === seed.correct,
  }));

  return {
    id: uuidv4(),
    text: seed.text,
    context: seed.context,
    category: group.category,
    difficulty: group.difficulty,
    answers,
  };
}

async function seedQuestions() {
  const existing = await database.getQuestions({});
  const existingTexts = new Set(
    existing.map((q) => q.text.toLowerCase().trim())
  );

  let inserted = 0;
  let skipped = 0;
  let invalid = 0;

  for (const group of SEED_GROUPS) {
    for (const seed of group.questions) {
      if (existingTexts.has(seed.text.toLowerCase().trim())) {
        skipped++;
        continue;
      }

      const question = buildQuestion(group, seed);
      const validation = QuestionValidationService.validateQuestion(question);
      if (!validation.isValid) {
        invalid++;
        console.error(
          `Skipping invalid question "${seed.text}": ${validation.errors.join(", ")}`
        );
        continue;
      }

      await database.createQuestion(question);
      existingTexts.add(seed.text.toLowerCase().trim());
      inserted++;
    }
  }

  const counts = await database.getQuestions({});
  const byCategory = counts.reduce<Record<string, number>>((acc, q) => {
    acc[q.category] = (acc[q.category] || 0) + 1;
    return acc;
  }, {});

  console.log(`[seed] Questions inserted: ${inserted}`);
  console.log(`[seed] Questions skipped as duplicates: ${skipped}`);
  console.log(`[seed] Questions rejected as invalid: ${invalid}`);
  console.log(`[seed] Total questions in database: ${counts.length}`);
  for (const [category, count] of Object.entries(byCategory)) {
    console.log(`[seed]   ${category}: ${count}`);
  }
  process.exit(0);
}

seedQuestions().catch((error) => {
  console.error("[seed] Question seeding failed:", error);
  process.exit(1);
});
