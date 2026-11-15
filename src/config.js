const basePath = process.cwd();
const { MODE } = require(`${basePath}/constants/blend_mode.js`);
const { NETWORK } = require(`${basePath}/constants/network.js`);

const network = NETWORK.eth;

// General metadata for Ethereum
const namePrefix = "Sociedade Mecânica de Futebol";
const description = "O verão da lata vem aí";
const baseUri = "ipfs://NewUriToReplace";

const solanaMetadata = {
  symbol: "YC",
  seller_fee_basis_points: 1000, // Define how much % you want from secondary market sales 1000 = 10%
  external_url: "https://www.youtube.com/c/hashlipsnft",
  creators: [
    {
      address: "7fXNuer5sbZtaTEPhtJ5g5gNtuyRoKkvxdjEjEnPN4mC",
      share: 100,
    },
  ],
};

// If you have selected Solana then the collection starts from 0 automatically
const collectionSize = 400;
const weightA = 3;
const weightB = 1;
const weightFire = 5/100;
const editionSizeSmallHats = collectionSize*(1-weightFire)*weightA/(weightA+weightB);
const editionSizeBigHats = collectionSize*(1-weightFire)*weightB/(weightA+weightB);
const editionSizeFireSmallHats = collectionSize*weightFire*weightA/(weightA+weightB);
const editionSizeFireBigHats = collectionSize*weightFire*weightB/(weightA+weightB);

const layerConfigurations = [
  {
    // small hats
    growEditionSizeTo: (editionSizeSmallHats),
    layersOrder: [
      { name: "nomes" , 
        options: {
          bypassDNA: true
        }
      },
      { name: "fundo" , 
        options: {
          bypassDNA: true
        }
      }, 
      { name: "chassi" },
      { name: "pichações" },{ name: "pichações" },{ name: "pichações" },{ name: "pichações" },{ name: "pichações" },{ name: "pichações" },{ name: "pichações" },{ name: "pichações" },
      { name: "danos" },
      { name: "antena A" },
      { name: "camisa" },
      { name: "boca A" },
      { name: "olhos" },
      { name: "chápeu A" },
      { name: "joias" },
    ],
  },
  {
    // big hats
    growEditionSizeTo: (editionSizeSmallHats + editionSizeBigHats),
    layersOrder: [
      { name: "nomes" , 
        options: {
          bypassDNA: true
        }
      },
      { name: "fundo" , 
        options: {
          bypassDNA: true
        }
      }, 
      { name: "chassi" },
      { name: "pichações" },{ name: "pichações" },{ name: "pichações" },{ name: "pichações" },{ name: "pichações" },{ name: "pichações" },{ name: "pichações" },{ name: "pichações" },
      { name: "danos" },
      { name: "antena B" },
      { name: "camisa" },
      { name: "boca B" },
      { name: "olhos" },
      { name: "chápeu B" },
      { name: "joias" },
    ],
  },
  {
    // fire + small hats
    growEditionSizeTo: (editionSizeSmallHats + editionSizeBigHats + editionSizeFireSmallHats),
    layersOrder: [
      { name: "nomes" , 
        options: {
          bypassDNA: true
        }
      },
      { name: "fundo" , 
        options: {
          bypassDNA: true
        }
      }, 
      { name: "chassi" },
      { name: "pichações" },{ name: "pichações" },{ name: "pichações" },{ name: "pichações" },{ name: "pichações" },{ name: "pichações" },{ name: "pichações" },{ name: "pichações" },
      { name: "danos" },
      { name: "antena A" },
      { name: "boca A" },
      { name: "olhos" },
      { name: "chápeu A" },
      { name: "joias" },
      { name: "camisa queimando" },
    ],
  },
  {
    // fire + big hats
    growEditionSizeTo: (editionSizeSmallHats + editionSizeBigHats + editionSizeFireSmallHats + editionSizeFireBigHats),
    layersOrder: [
      { name: "nomes" , 
        options: {
          bypassDNA: true
        }
      },
      { name: "fundo" , 
        options: {
          bypassDNA: true
        }
      }, 
      { name: "chassi" },
      { name: "pichações" },{ name: "pichações" },{ name: "pichações" },{ name: "pichações" },{ name: "pichações" },{ name: "pichações" },{ name: "pichações" },{ name: "pichações" },
      { name: "danos" },
      { name: "antena B" },
      { name: "boca B" },
      { name: "olhos" },
      { name: "chápeu B" },
      { name: "joias" },
      { name: "superaquecimento" },
    ],
  },
];

const shuffleLayerConfigurations = true;

const debugLogs = false;

const format = {
  width: 2160,
  height: 2160,
  smoothing: false,
};

const gif = {
  export: false,
  repeat: 0,
  quality: 100,
  delay: 500,
};

const text = {
  only: false,
  color: "#ffffff",
  size: 20,
  xGap: 40,
  yGap: 40,
  align: "left",
  baseline: "top",
  weight: "regular",
  family: "Courier",
  spacer: " => ",
};

const pixelFormat = {
  ratio: 1/90,
};

const background = {
  generate: false,
  brightness: "80%",
  static: false,
  default: "#000000",
};

const extraMetadata = {};

const rarityDelimiter = "#";

const uniqueDnaTorrance = 10;

const preview = {
  thumbPerRow: 5,
  thumbWidth: 50,
  imageRatio: format.height / format.width,
  imageName: "preview.png",
};

const preview_gif = {
  numberOfImages: 5,
  order: "ASC", // ASC, DESC, MIXED
  repeat: 0,
  quality: 100,
  delay: 500,
  imageName: "preview.gif",
};

module.exports = {
  format,
  baseUri,
  description,
  background,
  uniqueDnaTorrance,
  layerConfigurations,
  rarityDelimiter,
  preview,
  shuffleLayerConfigurations,
  debugLogs,
  extraMetadata,
  pixelFormat,
  text,
  namePrefix,
  network,
  solanaMetadata,
  gif,
  preview_gif,
};
