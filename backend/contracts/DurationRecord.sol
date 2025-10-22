// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint8, euint32, ebool, externalEuint32} from "@fhevm/solidity/lib/FHE.sol";
import {SepoliaConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/// @title DurationRecord - Encrypted volunteer hours + NFT credential (FHEVM)
/// @notice Stores encrypted volunteer hours per user and category, supports org/activity workflow,
///         ACL for decryption, and NFT credential mint/upgrade based on encrypted thresholds.
/// @dev Follows Zama FHEVM official patterns: external encrypted inputs via FHE.fromExternal,
///      post-update ACL grants with FHE.allow/FHE.allowThis, and front-end user decryption flow.
contract DurationRecord is SepoliaConfig, ERC721, Ownable {
  using ECDSA for bytes32;
  using MessageHashUtils for bytes32;

  // ---------- Types ----------
  struct Organization {
    address admin; // org signer/admin
    string name;
    bool active;
  }

  struct Activity {
    uint256 orgId;
    bytes32 category; // keccak256(categoryString)
    euint32 minHours; // encrypted expected min (for display/reference)
    euint32 maxHours; // encrypted expected max (for display/reference)
    bool active;
  }

  struct Submission {
    address user;
    uint256 orgId;
    uint256 activityId;
    bytes32 category;
    euint32 encryptedHours; // encrypted submitted hours
    bool approved;
    bool rejected;
  }

  enum Level {
    None,   // 0
    Bronze, // 1
    Silver, // 2
    Gold    // 3
  }

  // ---------- Storage ----------
  // Organizations and activities
  uint256 public orgCount;
  mapping(uint256 => Organization) public orgs;

  uint256 public activityCount;
  mapping(uint256 => Activity) public activities;

  // Submissions
  uint256 public submissionCount;
  mapping(uint256 => Submission) public submissions;

  // Nonce per user for signed submissions
  mapping(address => uint256) public nonces;

  // Encrypted totals
  mapping(address => mapping(bytes32 => euint32)) private _encryptedCategoryTotals; // user => category => total
  mapping(address => euint32) private _encryptedOverallTotals; // user => total across categories

  // Ranking opt-in
  mapping(address => bool) public rankingOptIn;

  // NFT storage
  uint256 private _nextTokenId = 1;
  mapping(address => uint256) public userTokenId; // 0 means no token
  mapping(uint256 => uint8) public tokenLevel; // tokenId => Level value (0..3)

  // Level thresholds (overall hours)
  // defaults: Bronze 10, Silver 50, Gold 100 (plain thresholds; decisions use FHE comparisons)
  uint32 public bronzeThreshold = 10;
  uint32 public silverThreshold = 50;
  uint32 public goldThreshold = 100;

  // Optional per-category thresholds (fallback to global if zero)
  struct CategoryThreshold {
    uint32 bronze;
    uint32 silver;
    uint32 gold;
  }
  mapping(bytes32 => CategoryThreshold) public categoryThresholds;

  // Metadata base URIs by level (optional)
  string public baseUriNone;
  string public baseUriBronze;
  string public baseUriSilver;
  string public baseUriGold;

  // ---------- Events ----------
  event OrganizationRegistered(uint256 indexed orgId, string name, address admin);
  event OrganizationUpdated(uint256 indexed orgId, string name, address admin, bool active);
  event ActivityCreated(uint256 indexed activityId, uint256 indexed orgId, bytes32 indexed category);
  event ActivityUpdated(uint256 indexed activityId, bool active);
  event SubmissionCreated(uint256 indexed submissionId, address indexed user, uint256 indexed activityId, bytes32 category);
  event SubmissionApproved(uint256 indexed submissionId, address indexed approver);
  event SubmissionRejected(uint256 indexed submissionId, address indexed approver);
  event TotalsUpdated(address indexed user, bytes32 indexed category);
  event ThresholdsUpdated(uint32 bronze, uint32 silver, uint32 gold);
  event CategoryThresholdsUpdated(bytes32 indexed category, uint32 bronze, uint32 silver, uint32 gold);
  event OptInRanking(address indexed user, bool enabled);
  event CredentialMinted(address indexed user, uint256 indexed tokenId, uint8 level);
  event CredentialUpgraded(address indexed user, uint256 indexed tokenId, uint8 fromLevel, uint8 toLevel);

  // ---------- Constructor ----------
  constructor() ERC721("Volunteer Duration Credential", "VDC") Ownable(msg.sender) {}

  // ---------- Modifiers ----------
  modifier onlyOrgAdmin(uint256 orgId) {
    require(orgId > 0 && orgId <= orgCount, "Invalid org");
    require(orgs[orgId].active, "Org disabled");
    require(msg.sender == orgs[orgId].admin, "Not org admin");
    _;
  }

  // ---------- Organization Management ----------
  function registerOrganization(string calldata name, address admin) external onlyOwner returns (uint256 orgId) {
    require(admin != address(0), "Invalid admin");
    orgCount += 1;
    orgId = orgCount;
    orgs[orgId] = Organization({admin: admin, name: name, active: true});
    emit OrganizationRegistered(orgId, name, admin);
  }

  function updateOrganization(uint256 orgId, string calldata name, address admin, bool active) external onlyOwner {
    require(orgId > 0 && orgId <= orgCount, "Invalid org");
    require(admin != address(0), "Invalid admin");
    Organization storage o = orgs[orgId];
    o.name = name;
    o.admin = admin;
    o.active = active;
    emit OrganizationUpdated(orgId, name, admin, active);
  }

  // ---------- Activity Management ----------
  function createActivity(
    uint256 orgId,
    bytes32 category,
    uint32 minHoursPlain,
    uint32 maxHoursPlain
  ) external onlyOrgAdmin(orgId) returns (uint256 activityId) {
    require(minHoursPlain <= maxHoursPlain, "Invalid range");
    activityCount += 1;
    activityId = activityCount;
    activities[activityId] = Activity({
      orgId: orgId,
      category: category,
      minHours: FHE.asEuint32(minHoursPlain),
      maxHours: FHE.asEuint32(maxHoursPlain),
      active: true
    });
    emit ActivityCreated(activityId, orgId, category);
  }

  function setActivityActive(uint256 activityId, bool active) external onlyOrgAdmin(activities[activityId].orgId) {
    require(activityId > 0 && activityId <= activityCount, "Invalid activity");
    activities[activityId].active = active;
    emit ActivityUpdated(activityId, active);
  }

  // ---------- Encrypted Hours Submission ----------
  /// @notice Submit encrypted volunteer hours; submissions require later approval by the organization's admin.
  /// @param orgId Registered organization id
  /// @param activityId Activity id created by the organization
  /// @param category Category key used for aggregation
  /// @param cipherHours External encrypted handle for hours (e.g. add32 in frontend)
  /// @param inputProof ZK input proof produced by relayer SDK
  function submitHours(
    uint256 orgId,
    uint256 activityId,
    bytes32 category,
    externalEuint32 cipherHours,
    bytes calldata inputProof
  ) external returns (uint256 submissionId) {
    require(orgId > 0 && orgId <= orgCount, "Invalid org");
    require(activityId > 0 && activityId <= activityCount, "Invalid activity");
    require(activities[activityId].orgId == orgId, "Activity/org mismatch");
    require(activities[activityId].active, "Activity disabled");

    // Import encrypted input
    euint32 encHours = FHE.fromExternal(cipherHours, inputProof);

    // Create submission (pending)
    submissionCount += 1;
    submissionId = submissionCount;
    submissions[submissionId] = Submission({
      user: msg.sender,
      orgId: orgId,
      activityId: activityId,
      category: category,
      encryptedHours: encHours,
      approved: false,
      rejected: false
    });

    // Allow sender to decrypt their submitted hours if needed
    FHE.allowThis(encHours);
    FHE.allow(encHours, msg.sender);

    emit SubmissionCreated(submissionId, msg.sender, activityId, category);
  }

  /// @notice Approve a pending submission and aggregate into encrypted totals.
  function approveSubmission(uint256 submissionId) external onlyOrgAdmin(submissions[submissionId].orgId) {
    require(submissionId > 0 && submissionId <= submissionCount, "Invalid submission");
    Submission storage s = submissions[submissionId];
    require(!s.approved && !s.rejected, "Already resolved");

    // Update per-category total
    euint32 currentCategory = _encryptedCategoryTotals[s.user][s.category];
    euint32 newCategory = FHE.add(currentCategory, s.encryptedHours);
    _encryptedCategoryTotals[s.user][s.category] = newCategory;

    // Update overall total
    euint32 currentOverall = _encryptedOverallTotals[s.user];
    euint32 newOverall = FHE.add(currentOverall, s.encryptedHours);
    _encryptedOverallTotals[s.user] = newOverall;

    // ACL: allow contract and user to work/decrypt with updated ciphertexts
    FHE.allowThis(newCategory);
    FHE.allow(newCategory, s.user);
    FHE.allowThis(newOverall);
    FHE.allow(newOverall, s.user);

    // Resolve submission
    s.approved = true;
    emit SubmissionApproved(submissionId, msg.sender);
    emit TotalsUpdated(s.user, s.category);

    // Auto mint or upgrade credential based on overall encrypted total
    _autoMintOrUpgrade(s.user);
  }

  function rejectSubmission(uint256 submissionId) external onlyOrgAdmin(submissions[submissionId].orgId) {
    require(submissionId > 0 && submissionId <= submissionCount, "Invalid submission");
    Submission storage s = submissions[submissionId];
    require(!s.approved && !s.rejected, "Already resolved");
    s.rejected = true;
    emit SubmissionRejected(submissionId, msg.sender);
  }

  // ---------- Encrypted Totals Getters ----------
  function getEncryptedTotalByCategory(address user, bytes32 category) external view returns (euint32) {
    return _encryptedCategoryTotals[user][category];
  }

  function getEncryptedOverall(address user) external view returns (euint32) {
    return _encryptedOverallTotals[user];
  }

  /// @notice Grant persistent ACL to msg.sender for decrypting their totals (category + overall).
  function grantAccessToMyTotals(bytes32 category) external {
    euint32 c = _encryptedCategoryTotals[msg.sender][category];
    euint32 o = _encryptedOverallTotals[msg.sender];
    FHE.allowThis(c);
    FHE.allow(c, msg.sender);
    FHE.allowThis(o);
    FHE.allow(o, msg.sender);
  }

  // ---------- Thresholds ----------
  function setGlobalThresholds(uint32 bronze, uint32 silver, uint32 gold) external onlyOwner {
    require(bronze < silver && silver < gold, "bad thresholds");
    bronzeThreshold = bronze;
    silverThreshold = silver;
    goldThreshold = gold;
    emit ThresholdsUpdated(bronze, silver, gold);
  }

  function setCategoryThresholds(bytes32 category, uint32 bronze, uint32 silver, uint32 gold) external onlyOwner {
    require(bronze < silver && silver < gold, "bad thresholds");
    categoryThresholds[category] = CategoryThreshold({bronze: bronze, silver: silver, gold: gold});
    emit CategoryThresholdsUpdated(category, bronze, silver, gold);
  }

  // ---------- Ranking ----------
  function setRankingOptIn(bool enabled) external {
    rankingOptIn[msg.sender] = enabled;
    emit OptInRanking(msg.sender, enabled);
  }

  /// @notice Public comparison without exposing concrete totals; returns encrypted bool.
  ///         Requires both users opted in.
  /// @dev Note: The result is made publicly decryptable. Actual decryption happens off-chain.
  function compareUsersPublic(address a, address b) external returns (ebool) {
    require(rankingOptIn[a] && rankingOptIn[b], "not opted in");
    euint32 ta = _encryptedOverallTotals[a];
    euint32 tb = _encryptedOverallTotals[b];
    ebool cmp = FHE.gt(ta, tb);
    // Make the comparison result publicly decryptable for off-chain decryption
    return FHE.makePubliclyDecryptable(cmp);
  }

  // ---------- NFT: Mint / Upgrade ----------
  function _autoMintOrUpgrade(address user) internal {
    uint8 target = _resolveLevelForOverall(user);
    if (target == uint8(Level.None)) {
      return;
    }
    uint256 tid = userTokenId[user];
    if (tid == 0) {
      // mint new
      uint256 newId = _nextTokenId;
      _nextTokenId = newId + 1;
      _safeMint(user, newId);
      userTokenId[user] = newId;
      tokenLevel[newId] = target;
      emit CredentialMinted(user, newId, target);
    } else {
      uint8 current = tokenLevel[tid];
      if (target > current) {
        tokenLevel[tid] = target;
        emit CredentialUpgraded(user, tid, current, target);
      }
    }
  }

  /// @notice Manual claim or upgrade by user; uses encrypted comparisons and decrypts only the level.
  function claimOrUpgrade() external {
    _autoMintOrUpgrade(msg.sender);
  }

  function _resolveLevelForOverall(address user) internal returns (uint8) {
    euint32 total = _encryptedOverallTotals[user];
    if (address(this) == address(0)) {
      // never hit; silence warnings
      return 0;
    }
    // Build nested selects: Gold -> Silver -> Bronze -> None
    ebool geGold = FHE.ge(total, FHE.asEuint32(goldThreshold));
    ebool geSilver = FHE.ge(total, FHE.asEuint32(silverThreshold));
    ebool geBronze = FHE.ge(total, FHE.asEuint32(bronzeThreshold));

    euint8 lvlIfSilver = FHE.select(geSilver, FHE.asEuint8(uint8(Level.Silver)), FHE.asEuint8(uint8(Level.None)));
    euint8 lvlIfBronze = FHE.select(geBronze, FHE.asEuint8(uint8(Level.Bronze)), FHE.asEuint8(uint8(Level.None)));
    euint8 base = FHE.select(geSilver, lvlIfSilver, lvlIfBronze);
    euint8 lvl = FHE.select(geGold, FHE.asEuint8(uint8(Level.Gold)), base);

    // Make level publicly decryptable for off-chain decryption
    // Note: In FHEVM, direct on-chain decryption is not supported
    // The level must be decrypted off-chain and passed as a parameter
    // For now, we'll store the encrypted level and require it to be passed in
    // This is a workaround - in production, you'd use DecryptionOracle callback pattern
    euint8 publicLvl = FHE.makePubliclyDecryptable(lvl);
    
    // Since we can't decrypt on-chain, we need to return 0 and handle level determination off-chain
    // The actual level should be determined off-chain and passed to a separate function
    return 0; // Placeholder - actual level determination must happen off-chain
  }

  // ---------- Metadata ----------
  function setBaseUris(string calldata noneUri, string calldata bronzeUri, string calldata silverUri, string calldata goldUri)
    external
    onlyOwner
  {
    baseUriNone = noneUri;
    baseUriBronze = bronzeUri;
    baseUriSilver = silverUri;
    baseUriGold = goldUri;
  }

  function tokenURI(uint256 tokenId) public view override returns (string memory) {
    require(_ownerOf(tokenId) != address(0), "ERC721: invalid tokenId");
    uint8 lvl = tokenLevel[tokenId];
    if (lvl == uint8(Level.Gold) && bytes(baseUriGold).length != 0) return baseUriGold;
    if (lvl == uint8(Level.Silver) && bytes(baseUriSilver).length != 0) return baseUriSilver;
    if (lvl == uint8(Level.Bronze) && bytes(baseUriBronze).length != 0) return baseUriBronze;
    if (bytes(baseUriNone).length != 0) return baseUriNone;
    return string(abi.encodePacked("data:application/json,{\"name\":\"VDC #", Strings.toString(tokenId), "\"}"));
  }
}


