import Logo from "../assets/SpartanguessrLogo.png";

const demoTeam = [
    { name: "AJ", color: "#ed8796" },
    { name: "Brian", color: "#eed49f" },
    { name: "William", color: "#a6da95" },
    { name: "Ngoc", color: "#8aadf4" },
];

export default function AboutPanel() {
    return (
        <section
            className="about-panel"
            id="landing-panel"
            role="tabpanel"
            aria-labelledby="landing-tab-about"
        >
            <img className="about-logo" src={Logo} alt="SpartanGuessr" />
            <div className="about-thanks">
                <strong>Special thanks to the original team for helping with the game's demo:</strong>
                <div className="about-team-list" aria-label="Original demo team">
                    {demoTeam.map((member, index) => (
                        <span key={member.name} className="about-team-member">
                            {index > 0 && "·"}
                            <strong style={{ color: member.color }}>{member.name}</strong>
                        </span>
                    ))}
                </div>
            </div>
            <div className="about-creator">
                <span>Created by:</span>
                <strong>Andrew Hiponia</strong>
            </div>
            <p className="about-submit">Want to add images to the game? Follow the steps here.</p>
        </section>
    );
}
